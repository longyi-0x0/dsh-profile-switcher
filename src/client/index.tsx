/**
 * Client half entry point.
 *
 * The build wraps the compiled output in `window.__ModuleLoader__.load({ id, factory })`;
 * this module only exports the plugin object the factory returns.
 */
export { apply, inject } from './apply'
