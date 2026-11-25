/** Look up an element by selector and assert its type, failing loudly if the markup drifts. */
export function find<Element extends HTMLElement>(
  selector: string,
  type: new () => Element,
): Element {
  const element = document.querySelector(selector);
  if (element instanceof type === false) {
    throw new Error(`[demo] Expected ${type.name} at "${selector}"`);
  }
  return element as Element;
}
