/** Provider-supplied URLs are configuration, never inferred from request headers. */
export function resolveRuntimeConfig(environment = process.env) {
  const nodeEnv = environment.NODE_ENV || 'development';
  const candidate = environment.APP_URL?.trim() || environment.RENDER_EXTERNAL_URL?.trim()
    || (nodeEnv === 'production' ? '' : 'http://localhost:5173');
  let url;
  try { url = new URL(candidate); }
  catch { throw new Error('Set APP_URL to the public application address, or use a host that provides RENDER_EXTERNAL_URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The application address must be an HTTP(S) origin without a path or credentials.');
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new Error('Production requires a public HTTPS application address.');
  }
  return { nodeEnv, appUrl: url.origin, previewMode: environment.NEATQUOTE_PREVIEW === '1' };
}
