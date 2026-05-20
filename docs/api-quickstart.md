# Signal Force API quickstart

Copy-paste curl examples for the deployed demo API. Verified working against the live stack on 2026-05-20.

## Connection details

- Base URL: `https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com`
- Gateway auth: HTTP Basic, `demoClient` / `demoSecret`. Goes in the `Authorization` header.
- App auth: separate. After `POST /auth/login` you get a `sessionId`. Verify with `POST /auth/mfa/verify`. The static OTP is `123456`.
- Content type for POSTs: `application/json`.

## Seeded users

30 users, ids `USER#001` through `USER#030`, usernames `user001` through `user030`. All share password `Password1`.

The user id contains a `#`. In query strings that becomes `%23`, so `USER#001` becomes `USER%23001`. Postman handles this for you when you put the value in the Params tab.

## Auth flow (run these two first)

### 1. Login

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/auth/login' \
  -d '{
    "username": "user001",
    "password": "Password1",
    "location": "New York",
    "deviceId": "device-abc"
  }'
```

200 response:
```json
{ "data": { "status": "SUCCESS", "userId": "USER#001", "sessionId": "SESSION#xxxxxxxx" } }
```

Copy the `sessionId` for the next call.

### 2. MFA verify

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/auth/mfa/verify' \
  -d '{
    "sessionId": "SESSION#xxxxxxxx",
    "otp": "123456"
  }'
```

200 response:
```json
{ "data": { "status": "SUCCESS", "message": "MFA verified" } }
```

## Customer surface

### Dashboard (aggregate view)

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/dashboard?userId=USER%23001'
```

Returns the user, fraud status, current offers and nudges, plus recent activity. Verified 200.

### Get user profile

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/user/profile?userId=USER%23001'
```

### Get offers

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/offers?userId=USER%23001'
```

204 (no content) means the user has no live offers right now. Trigger a fresh evaluate to seed one.

### Track offer action

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/offers/action' \
  -d '{
    "userId": "USER#001",
    "offerId": "OFFER#001",
    "action": "CLICK"
  }'
```

Valid actions: `CLICK`, `DISMISS`, `CONVERT`.

### Get nudges

```bash
curl -u demoClient:demoSecret \
  'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/nudges?userId=USER%23001'
```

### Track nudge action

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/nudges/action' \
  -d '{
    "userId": "USER#001",
    "nudgeId": "NUDGE#PROFILE",
    "action": "DISMISS"
  }'
```

## Transactions

### Transfer points (clean run)

```bash
curl -u demoClient:demoSecret \
  -H 'Content-Type: application/json' \
  -X POST 'https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com/transactions/transfer' \
  -d '{
    "userId": "USER#001",
    "recipientId": "USER#002",
    "amount": 500,
    "channel": "APP"
  }'
```

### Transfer (trigger fraud hold)

Run the transfer call above five times in quick succession (within an hour) from the same sender. The fifth one trips the heuristic (`transferCount1h >= 4`) and returns a HELD decision plus a fraud SNS publish.

## Postman setup tips

1. New collection, set the collection-level Authorization to Basic, username `demoClient`, password `demoSecret`. Every request inherits it.
2. Add a collection-level variable `baseUrl` = `https://55p8lbxf9g.execute-api.us-east-1.amazonaws.com` and use `{{baseUrl}}/auth/login` etc in the URL field. Lets you swap stages later by changing the variable.
3. For the user id query param put `USER#001` in the Params tab. Postman encodes the `#` for you. Do not paste `USER%23001` there or it double-encodes.
4. After Login, grab `data.sessionId` from the response and store it in a `sessionId` collection variable using a Test script:
   ```js
   pm.collectionVariables.set('sessionId', pm.response.json().data.sessionId);
   ```
   Then in MFA Verify body use `{{sessionId}}`.
5. If you get a 502 / 504 once after a long idle, that is a Lambda cold start. Retry once.

## Common errors decoded

| HTTP | code in body                | Meaning                                                                 |
|------|-----------------------------|-------------------------------------------------------------------------|
| 401  | (no body)                   | Missing or wrong gateway Basic Auth header. Check `demoClient:demoSecret`. |
| 401  | `INVALID_CREDENTIALS`       | Wrong username or password in the JSON body. Use `user001` / `Password1`.  |
| 400  | `MISSING_FIELD`             | A required field is missing from the body or query. Compare to the curl above. |
| 400  | `VALIDATION_ERROR`          | Field is present but the value is invalid (for example `amount <= 0`).  |
| 403  | `ACCOUNT_BLOCKED`           | Heuristic flagged the user. State is in `UserState`. Reset by editing the row in DynamoDB. |
| 404  | `USER_NOT_FOUND`            | The `userId` or `recipientId` does not exist in `UserProfile`.          |
| 500  | `INTERNAL_ERROR`            | Unhandled exception. Tail CloudWatch logs: `aws logs tail signal-force-runtime-ApiLambdaLogGroup3846CFFB-sSgrJbYDLaiR --follow --region us-east-1`. |

## What is verified vs not

Verified live: `POST /auth/login`, `POST /auth/mfa/verify`, `GET /dashboard`, `GET /offers`.
Not yet smoke-tested end-to-end: `GET /user/profile`, `POST /offers/action`, `GET /nudges`, `POST /nudges/action`, `POST /transactions/transfer`. They should work but flag anything weird and we will fix.
