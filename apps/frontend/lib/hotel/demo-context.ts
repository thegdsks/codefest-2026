export interface LoginContext {
  location?: string;
  deviceId?: string;
  deviceType?: string;
}

let loginContext: LoginContext = {};
let forceHighRiskTransfer = false;
let forceBlockTransfer = false;

export function getDemoLoginContext(): LoginContext {
  return loginContext;
}

export function setDemoLoginContext(ctx: LoginContext): void {
  loginContext = ctx;
}

export function getForceHighRiskTransfer(): boolean {
  return forceHighRiskTransfer;
}

export function setForceHighRiskTransfer(value: boolean): void {
  forceHighRiskTransfer = value;
}

export function getForceBlockTransfer(): boolean {
  return forceBlockTransfer;
}

export function setForceBlockTransfer(value: boolean): void {
  forceBlockTransfer = value;
}
