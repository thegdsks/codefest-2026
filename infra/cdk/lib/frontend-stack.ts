import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import { ssmSpaUrlPath } from './config';

export class FrontendStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Private bucket, no public access. CloudFront talks to it via OAC.
    this.bucket = new s3.Bucket(this, 'SpaBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
    });

    // Distribution with OAC (Origin Access Control), the modern replacement
    // for Origin Access Identity. Error responses rewrite SPA deep links to
    // index.html so React Router can pick them up on the client.
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      defaultRootObject: 'index.html',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      comment: 'signal-force SPA distribution',
    });

    // Optional: if apps/frontend/dist exists at synth time, deploy it.
    // Keeps `cdk synth` working before the frontend team has produced a build.
    const distPath = path.join(__dirname, '..', '..', '..', 'apps', 'frontend', 'dist');
    const distExists = fs.existsSync(distPath);
    let deployment: s3deploy.BucketDeployment | undefined;
    if (distExists) {
      deployment = new s3deploy.BucketDeployment(this, 'SpaDeployment', {
        sources: [s3deploy.Source.asset(distPath)],
        destinationBucket: this.bucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
        prune: true,
      });
    }

    // Stage is read here so FrontendStack does not need a custom StackProps shape.
    // SF_STAGE follows the same precedence as resolveDeployEnv in config.ts.
    const stage = process.env['SF_STAGE'] ?? 'dev';
    // Publish the distribution URL to SSM for tooling that needs it.
    new ssm.StringParameter(this, 'SpaUrlParam', {
      parameterName: ssmSpaUrlPath(stage),
      stringValue: `https://${this.distribution.distributionDomainName}`,
      description: 'Public URL for the signal-force SPA (CloudFront)',
    });

    NagSuppressions.addResourceSuppressions(
      this.bucket,
      [
        {
          id: 'AwsSolutions-S1',
          reason:
            'Server access logging on the SPA bucket is deferred. CloudFront standard logs cover the access path that actually matters for this stack.',
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      this.distribution,
      [
        {
          id: 'AwsSolutions-CFR1',
          reason:
            'No geographic restrictions on the demo. Customer surface is open to evaluators globally.',
        },
        {
          id: 'AwsSolutions-CFR2',
          reason:
            'WAF in front of CloudFront is documented as post-event work (see docs/architecture.md upgrade path).',
        },
        {
          id: 'AwsSolutions-CFR3',
          reason:
            'Standard access logs deferred. Demo traffic is light enough that CloudWatch metrics are sufficient for the event.',
        },
        {
          id: 'AwsSolutions-CFR4',
          reason:
            'Distribution explicitly sets minimumProtocolVersion to TLSv1.2_2021. The finding can fire on default cert configurations and is not applicable here.',
        },
      ],
      true
    );

    // BucketDeployment spins up a CDK-managed singleton helper Lambda at the
    // stack root with a default execution role and wildcards on the source
    // and destination buckets. These are standard for the construct, not
    // project decisions to revisit, so suppress with rationale.
    if (deployment) {
      const helperId = this.node.children
        .map((c) => c.node.id)
        .find((id) => id.startsWith('Custom::CDKBucketDeployment'));
      if (helperId) {
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `/${this.stackName}/${helperId}`,
          [
            {
              id: 'AwsSolutions-L1',
              reason:
                'Helper Lambda runtime is pinned by the construct library and follows aws-cdk-lib upgrades, not project decisions.',
            },
            {
              id: 'AwsSolutions-IAM4',
              reason: 'CDK BucketDeployment uses the AWS-managed AWSLambdaBasicExecutionRole.',
            },
            {
              id: 'AwsSolutions-IAM5',
              reason:
                'CDK BucketDeployment requires wildcard S3 permissions to copy and prune SPA assets between the staging bucket and the SPA bucket.',
            },
          ],
          true
        );
      }
    }

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      exportName: `${this.stackName}:BucketName`,
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      exportName: `${this.stackName}:DistributionId`,
    });
    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      exportName: `${this.stackName}:DistributionUrl`,
    });
  }
}
