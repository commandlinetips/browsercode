# Shadow DOM

Closed shadow roots are rare on the sites you're likely to automate. Most web components use open shadow roots — you can walk them from JS or have CDP traverse them for you with `pierce: true`.

## First try: coordinate clicks

Compositor-level clicks don't care about shadow roots. If you can see it in a screenshot, `Input.dispatchMouseEvent` can click it. This avoids all shadow-piercing entirely — reach for it first for buttons, links, and form triggers.

## CDP path: `DOM.getDocument({ pierce: true })`

`DOM.querySelector` / `DOM.querySelectorAll` do **not** accept a piercing flag. To search across shadow boundaries via CDP, fetch a flattened document tree (`pierce: true` on `DOM.getDocument` or `DOM.getFlattenedDocument`), walk the returned subtree to find the host node whose `shadowRoots[]` contains the element you want, then run `DOM.querySelector` against that shadow-root nodeId:

```js
await session.DOM.enable()
const { root } = await session.DOM.getDocument({ depth: -1, pierce: true })

// Walk the flat tree to find a shadow root inside <my-button>.
function findShadowRoot(node, hostName) {
  if (node.nodeName?.toLowerCase() === hostName && node.shadowRoots?.length) {
    return node.shadowRoots[0]   // open root
  }
  for (const c of node.children ?? []) {
    const hit = findShadowRoot(c, hostName)
    if (hit) return hit
  }
  return null
}
const shadowRoot = findShadowRoot(root, 'my-button')
if (!shadowRoot) throw new Error('shadow host not found')

const { nodeId } = await session.DOM.querySelector({
  nodeId: shadowRoot.nodeId,
  selector: '.inner-label',
})
```

For most automation tasks the JS-side recursive walk below is shorter and just as reliable.

## JS path: recursive walk through `shadowRoot`

More portable, works in any Chrome:

```js
await session.Runtime.evaluate({
  returnByValue: true,
  expression: `
    (() => {
      function* walk(root) {
        const stack = [root]
        while (stack.length) {
          const node = stack.pop()
          if (!node) continue
          yield node
          if (node.shadowRoot) stack.push(...node.shadowRoot.children)
          stack.push(...(node.children || []))
        }
      }
      for (const el of walk(document.body)) {
        if (el.matches?.('.target-class')) {
          const r = el.getBoundingClientRect()
          return { x: r.x + r.width/2, y: r.y + r.height/2 }
        }
      }
      return null
    })()
  `,
})
```

Use the returned `{x, y}` for `Input.dispatchMouseEvent`.

## Setting a value inside a shadow-DOM input

Reaching the input is the hard part — setting the value is the same as any input:

```js
await session.Runtime.evaluate({ expression: `
  (() => {
    const host = document.querySelector('my-form')
    const input = host.shadowRoot.querySelector('input[name=email]')
    input.focus()
    input.value = 'hi@example.com'
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  })()
`})
```

`composed: true` on the event lets it cross shadow boundaries — many web components listen on the host, not the internal input.

## Traps

- **Closed shadow roots** (`{ mode: 'closed' }`) cannot be walked from JS. Fall back to coordinate clicks + `Input.insertText`. Closed roots are rare — usually only password managers and some Google components.
- **`slot` content lives in the light DOM**, not the shadow root. If your element has `<slot>…</slot>`, the children you're looking for are `host.children`, not `host.shadowRoot.children`.
- **`::part()` / `::slotted()` CSS** affects styling but has no DOM-query equivalent — you still traverse `shadowRoot`.
- Element screenshots via `DOM.getBoxModel` work even for shadow-DOM elements once you have the `nodeId`.
