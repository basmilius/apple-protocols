# Text input

`tv.text` types into the focused text field of an Apple TV, such as a search field or a sign-in form.

```ts
tv.text.on('change', state => {
    if (state.active) {
        console.log('a keyboard is up', state.secure ? '(password)' : '', state.text);
    }
});

await tv.text.set('The Bear');
await tv.text.append(' season 2');
await tv.text.clear();
```

| Method | Meaning |
| --- | --- |
| `set(text)` | Replaces the text of the focused field |
| `append(text)` | Adds text at the end |
| `clear()` | Empties the field |

## Which protocol types

Companion Link goes first. Without it the text goes through the remote text input session over AirPlay. The state follows the same protocol. The methods throw `UnavailableError` only when both protocols are down.

## State

`text.state` is a `TextState`:

| Field | Meaning |
| --- | --- |
| `active` | Whether a text field has focus |
| `text` | The current text; always empty over AirPlay |
| `secure` | Whether the field is a password field |
| `keyboardType` | The keyboard type the field asks for |
| `autocorrection`, `autocapitalization` | The traits of the field |

`change` fires when a keyboard appears or goes away, and when Companion Link reports a new text. While Companion Link is down, the AirPlay keyboard messages fire it.
