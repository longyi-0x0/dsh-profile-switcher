/**
 * Plugin styles.
 *
 * Every colour comes from a `--dsw-alias-*` theme token; literal values are limited
 * to shadows, which have no token. Classes use the `dps-` prefix so copied host-like
 * markup can never collide with the Host stylesheet.
 */
export const STYLES = `
.dps-brandWrap{display:flex;align-items:center;gap:0;min-width:0;width:100%;max-width:100%;overflow:hidden}
.dps-brandWordmark{flex:none;display:block;color:var(--dsw-alias-label-primary)}
.dps-brandSpacer{flex:1 1 12px;min-width:6px}
.dps-brandPill{flex:0 1 auto;min-width:0;display:inline-flex;align-items:center;gap:4px;max-width:96px;height:22px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;cursor:pointer;-webkit-app-region:no-drag}
.dps-brandPill:hover,.dps-brandPillOpen{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dps-brandPill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dps-brandProfile{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dps-brandChev{flex:none;font-size:8px;opacity:.85}
.dps-chip{flex:none;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.dps-menu{position:fixed;z-index:1300;box-sizing:border-box;display:flex;flex-direction:column;gap:1px;padding:6px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 14px 36px rgba(0,0,0,.32);font-size:12.5px;line-height:1.4}
.dps-menuHead{padding:3px 8px 5px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dps-homeGroup{display:flex;flex-direction:column;gap:1px}
.dps-home{margin:6px 8px 2px;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dps-row{display:flex;align-items:center;gap:2px}
.dps-item{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dps-item:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dps-item:disabled{opacity:.6;cursor:default}
.dps-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.dps-itemName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dps-itemMeta{flex:none;font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.dps-badge{flex:none;padding:0 7px;border:1px solid var(--dsw-alias-brand-primary);border-radius:999px;color:var(--dsw-alias-brand-primary);font-size:10px;font-weight:500}
.dps-act{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dps-act:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dps-act:disabled{opacity:.5;cursor:default}
.dps-act:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.dps-actConfirm{min-width:auto;padding:0 8px;color:var(--dsw-alias-state-error-primary);font-size:10.5px}
.dps-actConfirm:hover:not(:disabled){color:var(--dsw-alias-state-error-primary)}
.dps-new{color:var(--dsw-alias-label-secondary)}
.dps-newPlus{font-size:11px}
.dps-scrim{position:fixed;inset:0;z-index:1450;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.34)}
.dps-dialog{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;width:340px;max-width:calc(100vw - 32px);padding:18px 20px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 24px 64px rgba(0,0,0,.38);font-size:12.5px}
.dps-dialogTitle{font-size:13px;font-weight:600}
.dps-dialogBody{display:flex;flex-direction:column;gap:6px}
.dps-dialogActions{display:flex;justify-content:flex-end;gap:8px}
.dps-dialogError{font-size:11px;line-height:1.45;color:var(--dsw-alias-state-error-primary)}
.dps-fieldHint{font-size:10px;line-height:1.45;color:var(--dsw-alias-label-secondary)}
.dps-input{box-sizing:border-box;width:100%;height:28px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.dps-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dps-notice{margin:2px 6px;padding:5px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.dps-muted{padding:6px 8px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dps-diagnostics{margin:2px 6px 4px;padding:5px 8px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;font-size:10.5px;color:var(--dsw-alias-state-error-primary)}
.dps-errorBox{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px}
.dps-error{flex:1;font-size:11px;color:var(--dsw-alias-state-error-primary);overflow:hidden;text-overflow:ellipsis}
.dps-retry{flex:none;height:22px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;cursor:pointer}
.dps-retry:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dps-embed{position:fixed;inset:0;z-index:1500;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.dps-topbar{position:absolute;left:0;right:0;z-index:3;display:flex;align-items:center;gap:8px;box-sizing:border-box;-webkit-app-region:drag;overflow:hidden}
.dps-topbarSpacer{flex:1;min-width:8px}
.dps-back,.dps-newTab{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;cursor:pointer;-webkit-app-region:no-drag;white-space:nowrap}
.dps-back:hover,.dps-newTab:hover{background:var(--dsw-alias-bg-layer-2)}
.dps-back:focus-visible,.dps-newTab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dps-newTab{color:var(--dsw-alias-label-secondary)}
.dps-btnFloat{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px rgba(0,0,0,.24)}
.dps-btnFloat:hover{background:var(--dsw-alias-bg-layer-2)}
.dps-backArrow{font-size:12px}
.dps-backName{color:var(--dsw-alias-label-secondary);font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dps-guestHost{position:absolute;top:var(--dps-inset,0px);left:0;right:0;bottom:0;display:flex;background:var(--dsw-alias-bg-base)}
.dps-guestView{width:100%;height:100%;border:0;display:flex}
.dps-center{position:absolute;inset:var(--dps-inset,0px) 0 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--dsw-alias-bg-base);z-index:1}
.dps-centerTitle{font-size:13px;font-weight:600}
.dps-centerHint{font-size:11px;color:var(--dsw-alias-label-secondary)}
.dps-errorCard{display:flex;flex-direction:column;align-items:center;gap:8px;max-width:420px;padding:20px 24px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 48px rgba(0,0,0,.28);text-align:center}
.dps-errorText{font-size:11.5px;color:var(--dsw-alias-state-error-primary);max-width:100%;overflow:hidden;text-overflow:ellipsis}
.dps-errorDetail{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dps-errorActions{display:flex;gap:8px;margin-top:4px}
.dps-primary{height:28px;padding:0 14px;border:1px solid var(--dsw-alias-brand-primary);border-radius:999px;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.dps-primary:hover{background:var(--dsw-alias-bg-layer-2)}
.dps-primary:focus-visible,.dps-ghost:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dps-ghost{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dps-ghost:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dps-loading{position:absolute;inset:var(--dps-inset,0px) 0 0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--dsw-alias-bg-base);z-index:1}
.dps-spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dps-spin .9s linear infinite}
.dps-srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@keyframes dps-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.dps-spinner{animation:none}}
`
