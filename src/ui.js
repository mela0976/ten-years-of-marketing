export function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.trim() ? text : null;
}

export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  const text = normalizeText(options.text);
  if (text !== null) node.textContent = text;
  if (options.type) node.type = options.type;
  if (options.value !== undefined && options.value !== null) node.value = options.value;
  if (options.min !== undefined && options.min !== null) node.min = options.min;
  if (options.max !== undefined && options.max !== null) node.max = options.max;
  if (options.step !== undefined && options.step !== null) node.step = options.step;
  if (options.checked !== undefined) node.checked = options.checked;
  if (options.hidden) node.hidden = true;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(name, value === true ? '' : String(value));
  }
  if (options.onClick) node.addEventListener('click', options.onClick);
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child instanceof Node) node.append(child);
    else {
      const childText = normalizeText(child);
      if (childText !== null) node.append(document.createTextNode(childText));
    }
  }
  return node;
}

export function button(label, onClick, kind = 'secondary', attrs = {}) {
  return element('button', {
    className: `button button-${kind}`,
    type: 'button',
    text: label,
    attrs,
    onClick,
  });
}

export function updateProgress(progress, chapterIndex, started) {
  progress.hidden = !started;
  progress.setAttribute('role', 'list');
  if (!started) return;
  progress.replaceChildren();
  for (let index = 0; index < 10; index += 1) {
    const year = 2018 + index;
    const step = element('span', {
      className: `progress-step${index === chapterIndex ? ' is-current' : ''}${index < chapterIndex ? ' is-done' : ''}`,
      text: String(year),
      attrs: { role: 'listitem', 'aria-current': index === chapterIndex ? 'step' : undefined, 'aria-label': String(year), title: String(year) },
    });
    progress.append(step);
  }
}

export function setPanel(panel, eyebrow, heading, children = [], variant = '') {
  panel.replaceChildren();
  panel.className = `panel${variant ? ` panel-${variant}` : ''}`;
  if (eyebrow) panel.append(element('p', { className: 'eyebrow', text: eyebrow }));
  if (heading) panel.append(element('h1', { className: 'panel-title', text: heading }));
  for (const child of children) if (child !== null && child !== undefined) panel.append(child);
}

export function statusText(status, message) {
  status.textContent = message;
}
