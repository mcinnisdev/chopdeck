A tiny status LED — the only "status colour" indicator in the system (no badges, no toasts).

```jsx
<Led color="green" on={playing} label="PLAY" />
<Led color="red" on={recording} />
```

Never use LEDs for decoration; each one must reflect real state.
