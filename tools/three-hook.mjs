// lets Node resolve the bare "three" import the same way the page's import map does
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../site/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
