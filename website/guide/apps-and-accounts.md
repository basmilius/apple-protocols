# Apps, accounts and system

These capabilities run over Companion Link and exist only on `AppleTV`. Each method throws `UnavailableError` while Companion Link is down, and Companion Link needs [credentials](/guide/pairing).

## Apps

```ts
const apps = await tv.apps.list();

for (const app of apps) {
    console.log(app.bundleId, app.name);
}

await tv.apps.launch('com.apple.TVWatchList');
await tv.apps.openUrl('https://tv.apple.com/show/umc.cmc.4ld1s4p0tuxwzfk6j8ebsvzua');
```

| Method | Meaning |
| --- | --- |
| `list()` | The apps the user can launch, as `App` records with `bundleId` and `name` |
| `launch(bundleId)` | Opens an app |
| `openUrl(url)` | Opens a universal link or an app URL scheme |

## Accounts

```ts
const accounts = await tv.accounts.list();
const other = accounts.find(account => account.name === 'Sam');

if (other) {
    await tv.accounts.switch(other.id);
}
```

`list()` returns the user accounts as `Account` records with `id` and `name`. `switch(id)` makes one the active user.

## System

`tv.system` holds system settings and Siri.

| Method | Meaning |
| --- | --- |
| `toggleCaptions()` | Turns subtitles on or off |
| `setAppearance(mode)` | `light` or `dark` |
| `setReduceLoudSounds(enabled)` | The Reduce Loud Sounds setting |
| `setFindingMode(enabled)` | Find My mode |
| `startSiri()`, `stopSiri()` | Starts and stops Siri listening |

```ts
await tv.system.setAppearance('dark');
await tv.system.toggleCaptions();
```
