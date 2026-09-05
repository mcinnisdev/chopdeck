/* @ds-bundle: {"format":4,"namespace":"FunMPCDesignSystem_3bf065","components":[{"name":"CursorPad","sourcePath":"components/controls/CursorPad.jsx"},{"name":"Fader","sourcePath":"components/controls/Fader.jsx"},{"name":"HardButton","sourcePath":"components/controls/HardButton.jsx"},{"name":"Knob","sourcePath":"components/controls/Knob.jsx"},{"name":"Led","sourcePath":"components/controls/Led.jsx"},{"name":"Pad","sourcePath":"components/controls/Pad.jsx"},{"name":"Lcd","sourcePath":"components/display/Lcd.jsx"},{"name":"LcdField","sourcePath":"components/display/Lcd.jsx"},{"name":"SoftKeys","sourcePath":"components/display/Lcd.jsx"},{"name":"LcdWindow","sourcePath":"components/display/LcdWindow.jsx"},{"name":"Panel","sourcePath":"components/display/Panel.jsx"},{"name":"Silkscreen","sourcePath":"components/display/Panel.jsx"},{"name":"Wordmark","sourcePath":"components/display/Panel.jsx"},{"name":"Waveform","sourcePath":"components/display/Waveform.jsx"}],"sourceHashes":{"components/controls/CursorPad.jsx":"2414debe279d","components/controls/Fader.jsx":"12048f213846","components/controls/HardButton.jsx":"f4c185b5547c","components/controls/Knob.jsx":"d909d08feff6","components/controls/Led.jsx":"cffc12466e94","components/controls/Pad.jsx":"6f21f2e76e6d","components/display/Lcd.jsx":"a975be6bf02c","components/display/LcdWindow.jsx":"17335187894d","components/display/Panel.jsx":"39afc83e341c","components/display/Waveform.jsx":"c0c8cbc71e86","ui_kits/chopdeck-app/Mpc.jsx":"c1baab75920f","ui_kits/chopdeck-app/Screens.jsx":"2606b46883a8","ui_kits/chopdeck-app/data.js":"326ccd397cbd"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FunMPCDesignSystem_3bf065 = window.FunMPCDesignSystem_3bf065 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/controls/Fader.jsx
try { (() => {
const {
  useRef,
  useState
} = React;
function Fader({
  label,
  value = 64,
  min = 0,
  max = 127,
  onChange,
  height = 140,
  onDark = false,
  style
}) {
  const [v, setV] = useState(value);
  const track = useRef(null);
  const cur = onChange ? value : v;
  const pct = (cur - min) / (max - min);
  const set = n => {
    const c = Math.max(min, Math.min(max, n));
    onChange ? onChange(c) : setV(c);
  };
  const fromY = clientY => {
    const r = track.current.getBoundingClientRect();
    set(min + (1 - (clientY - r.top) / r.height) * (max - min));
  };
  const onDown = e => {
    e.currentTarget.setPointerCapture(e.pointerId);
    fromY(e.clientY);
  };
  const onMove = e => {
    if (e.buttons) fromY(e.clientY);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      userSelect: 'none',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: 'var(--label-xs)',
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)',
      lineHeight: 1
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    ref: track,
    role: "slider",
    tabIndex: 0,
    "aria-label": label,
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": Math.round(cur),
    "aria-orientation": "vertical",
    onPointerDown: onDown,
    onPointerMove: onMove,
    onKeyDown: e => {
      if (e.key === 'ArrowUp') set(cur + (max - min) / 16);
      if (e.key === 'ArrowDown') set(cur - (max - min) / 16);
    },
    style: {
      position: 'relative',
      width: 28,
      height,
      background: 'var(--ink)',
      borderRadius: 3,
      boxShadow: 'var(--recess)',
      cursor: 'pointer',
      outline: 'none',
      touchAction: 'none',
      backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 calc(12.5% - 1px), rgba(255,255,255,.25) calc(12.5% - 1px) 12.5%)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      left: -6,
      right: -6,
      height: 22,
      top: `calc(${(1 - pct) * 100}% - 11px)`,
      background: 'var(--cream)',
      border: 'var(--stroke-w) solid var(--stroke)',
      borderRadius: 'var(--radius-key)',
      boxShadow: 'var(--bevel-key)',
      backgroundImage: 'linear-gradient(to bottom, transparent 45%, var(--ink) 45% 55%, transparent 55%)'
    }
  })));
}
Object.assign(__ds_scope, { Fader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Fader.jsx", error: String((e && e.message) || e) }); }

// components/controls/Knob.jsx
try { (() => {
const {
  useRef,
  useState
} = React;
function Knob({
  label,
  value = 50,
  min = 0,
  max = 100,
  onChange,
  size = 'md',
  ticks = true,
  onDark = false,
  style
}) {
  const [v, setV] = useState(value);
  const drag = useRef(null);
  const cur = onChange ? value : v;
  const d = size === 'lg' ? 'var(--knob-lg)' : size === 'sm' ? '36px' : 'var(--knob-md)';
  const angle = -135 + (cur - min) / (max - min) * 270;
  const set = n => {
    const c = Math.max(min, Math.min(max, n));
    onChange ? onChange(c) : setV(c);
  };
  const onDown = e => {
    drag.current = {
      y: e.clientY,
      v: cur
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = e => {
    if (!drag.current) return;
    set(drag.current.v + (drag.current.y - e.clientY) * ((max - min) / 150));
  };
  const onUp = () => {
    drag.current = null;
  };
  const lbl = (t, extra) => /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: 'var(--label-xs)',
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)',
      lineHeight: 1,
      ...extra
    }
  }, t);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      userSelect: 'none',
      ...style
    }
  }, label && lbl(label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: d,
      height: d
    }
  }, ticks && /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      inset: -6,
      borderRadius: '50%',
      background: `conic-gradient(from 225deg, ${onDark ? 'var(--cream)' : 'var(--ink)'} 0 270deg, transparent 270deg)`,
      WebkitMask: 'radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px) calc(50% - 1px), transparent calc(50% - 1px))',
      mask: 'radial-gradient(circle, transparent 0 calc(50% - 3px), #000 calc(50% - 3px) calc(50% - 1px), transparent calc(50% - 1px))',
      opacity: .6
    }
  }), /*#__PURE__*/React.createElement("div", {
    role: "slider",
    tabIndex: 0,
    "aria-label": label,
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": Math.round(cur),
    onPointerDown: onDown,
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onUp,
    onKeyDown: e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(cur + (max - min) / 20);
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(cur - (max - min) / 20);
    },
    style: {
      width: '100%',
      height: '100%',
      borderRadius: '50%',
      border: 'var(--stroke-w) solid var(--stroke)',
      background: 'radial-gradient(circle at 50% 35%, var(--ink-3), var(--ink) 70%)',
      boxShadow: 'var(--bevel-knob)',
      cursor: 'ns-resize',
      outline: 'none',
      position: 'relative',
      touchAction: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      left: '50%',
      top: '8%',
      width: 3,
      height: '36%',
      marginLeft: -1.5,
      background: 'var(--cream)',
      borderRadius: 2,
      transformOrigin: '50% 117%',
      transform: `rotate(${angle}deg)`,
      transition: drag.current ? 'none' : 'transform 60ms var(--ease-hw)'
    }
  }))), ticks && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      width: `calc(${d} + 12px)`
    }
  }, lbl('MIN', {
    opacity: .7
  }), lbl('MAX', {
    opacity: .7
  })));
}
Object.assign(__ds_scope, { Knob });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Knob.jsx", error: String((e && e.message) || e) }); }

// components/controls/Led.jsx
try { (() => {
const G = {
  red: ['var(--led-red)', 'var(--led-glow-red)'],
  green: ['var(--led-green)', 'var(--led-glow-green)'],
  amber: ['var(--led-amber)', 'var(--led-glow-amber)']
};
function Led({
  color = 'red',
  on = false,
  size,
  label,
  style
}) {
  const [c, glow] = G[color] || G.red;
  const s = size || 'var(--led-size)';
  const dot = /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      display: 'inline-block',
      width: s,
      height: s,
      borderRadius: '50%',
      background: on ? c : 'var(--led-off)',
      boxShadow: on ? `${glow}, inset 0 0 1px rgba(255,255,255,.8)` : 'inset 0 1px 1px rgba(0,0,0,.6)',
      transition: 'background var(--dur-led), box-shadow var(--dur-led)'
    }
  });
  if (!label) return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      ...style
    }
  }, dot);
  return /*#__PURE__*/React.createElement("span", {
    role: "status",
    "aria-label": `${label} ${on ? 'on' : 'off'}`,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: 'var(--label-xs)',
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: 'var(--text-silkscreen)',
      ...style
    }
  }, dot, label);
}
Object.assign(__ds_scope, { Led });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Led.jsx", error: String((e && e.message) || e) }); }

// components/controls/HardButton.jsx
try { (() => {
const {
  useState
} = React;
const CAPS = {
  key: {
    bg: 'var(--surface-key)',
    fg: 'var(--ink)'
  },
  red: {
    bg: 'var(--red)',
    fg: 'var(--ink)'
  },
  amber: {
    bg: 'var(--led-amber)',
    fg: 'var(--ink)'
  },
  dark: {
    bg: 'var(--ink-2)',
    fg: 'var(--cream)'
  },
  navy: {
    bg: 'var(--navy-light)',
    fg: 'var(--cream)'
  }
};
function HardButton({
  label,
  children,
  cap = 'key',
  size = 'md',
  led,
  ledOn = false,
  active = false,
  disabled = false,
  onClick,
  labelPosition = 'bottom',
  onDark = false,
  style
}) {
  const [down, setDown] = useState(false);
  const c = CAPS[cap] || CAPS.key;
  const dims = size === 'sm' ? {
    w: 'var(--key-w)',
    h: 'var(--key-h)',
    fs: 9
  } : size === 'lg' ? {
    w: 'var(--key-lg-w)',
    h: 'var(--key-lg-h)',
    fs: 11
  } : {
    w: 'var(--key-lg-w)',
    h: 'var(--key-h)',
    fs: 10
  };
  const pressed = down || active;
  // Label row and LED slot are fixed-height, so caps line up across a row whether or not a button has a LED/label.
  const lbl = /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 9,
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: 'var(--label-xs)',
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)',
      lineHeight: 1,
      textAlign: 'center',
      whiteSpace: 'nowrap'
    }
  }, label);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      opacity: disabled ? .45 : 1,
      userSelect: 'none',
      ...style
    }
  }, labelPosition === 'top' && lbl, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 'var(--led-size)'
    }
  }, led && /*#__PURE__*/React.createElement(__ds_scope.Led, {
    color: led,
    on: ledOn
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    disabled: disabled,
    "aria-label": label,
    "aria-pressed": active,
    onPointerDown: () => setDown(true),
    onPointerUp: () => setDown(false),
    onPointerLeave: () => setDown(false),
    onClick: onClick,
    style: {
      appearance: 'none',
      minWidth: dims.w,
      height: dims.h,
      padding: '0 6px',
      border: 'var(--stroke-w) solid var(--stroke)',
      borderRadius: 'var(--radius-key)',
      background: c.bg,
      color: c.fg,
      fontFamily: 'var(--font-label)',
      fontWeight: 700,
      fontSize: dims.fs,
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      lineHeight: 1,
      boxShadow: pressed ? 'var(--bevel-key-pressed)' : 'var(--bevel-key)',
      transform: pressed ? 'translateY(var(--press-offset))' : 'none',
      transition: 'transform var(--dur-press), box-shadow var(--dur-press)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      outline: 'none'
    }
  }, children), labelPosition === 'bottom' && lbl);
}
Object.assign(__ds_scope, { HardButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/HardButton.jsx", error: String((e && e.message) || e) }); }

// components/controls/CursorPad.jsx
try { (() => {
function CursorPad({
  onMove,
  label = 'CURSOR',
  onDark = false,
  style
}) {
  const k = (dir, ch, extra) => /*#__PURE__*/React.createElement(__ds_scope.HardButton, {
    size: "sm",
    onClick: () => onMove?.(dir),
    style: extra
  }, ch);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: 'var(--label-xs)',
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)',
      lineHeight: 1
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto auto auto',
      gridTemplateRows: 'auto auto auto',
      gap: 2,
      padding: 6,
      background: 'var(--cream-2)',
      border: 'var(--stroke-w) solid var(--stroke)',
      borderRadius: 'var(--radius-panel)',
      boxShadow: 'var(--recess)'
    }
  }, /*#__PURE__*/React.createElement("span", null), " ", k('up', '▲'), " ", /*#__PURE__*/React.createElement("span", null), k('left', '◀'), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      width: 'var(--key-w)'
    }
  }), " ", k('right', '▶'), /*#__PURE__*/React.createElement("span", null), " ", k('down', '▼'), " ", /*#__PURE__*/React.createElement("span", null)));
}
Object.assign(__ds_scope, { CursorPad });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/CursorPad.jsx", error: String((e && e.message) || e) }); }

// components/controls/Pad.jsx
try { (() => {
const {
  useState
} = React;
function Pad({
  label = 'PAD 1',
  note,
  color = 'red',
  lit = false,
  size,
  onTrigger,
  style
}) {
  const [down, setDown] = useState(false);
  const active = down || lit;
  const bg = color === 'grey' ? 'var(--surface-pad-alt)' : 'var(--surface-pad)';
  const s = size || 'var(--pad-size)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      gap: 4,
      width: s,
      userSelect: 'none',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: 'var(--label-xs)',
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: 'var(--text-silkscreen)',
      lineHeight: 1
    }
  }, /*#__PURE__*/React.createElement("span", null, label), note && /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .7
    }
  }, note)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label,
    "aria-pressed": active,
    onPointerDown: e => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDown(true);
      onTrigger?.();
    },
    onPointerUp: () => setDown(false),
    onPointerLeave: () => setDown(false),
    style: {
      appearance: 'none',
      width: s,
      height: s,
      padding: 0,
      border: 'var(--stroke-w) solid var(--stroke)',
      borderRadius: 'var(--radius-pad)',
      background: active ? color === 'grey' ? 'var(--cream)' : 'var(--red-soft)' : bg,
      boxShadow: active ? color === 'grey' ? 'var(--bevel-pad-pressed)' : 'var(--bevel-pad-pressed), var(--pad-glow)' : 'var(--bevel-pad)',
      transform: active ? 'translateY(var(--pad-press-offset))' : 'none',
      transition: 'transform var(--dur-press), box-shadow var(--dur-press), background var(--dur-led)',
      cursor: 'pointer',
      outline: 'none'
    }
  }));
}
Object.assign(__ds_scope, { Pad });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/controls/Pad.jsx", error: String((e && e.message) || e) }); }

// components/display/Lcd.jsx
try { (() => {
function Lcd({
  children,
  title,
  cols = 40,
  rows = 8,
  fontSize = 'var(--lcd-md)',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      gap: 6,
      ...style
    }
  }, title && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: 'var(--label-xs)',
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: 'var(--text-silkscreen)',
      lineHeight: 1
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 6,
      background: 'var(--ink)',
      borderRadius: 'var(--radius-lcd)',
      boxShadow: '0 2px 0 var(--ink-3), inset 0 1px 0 rgba(255,255,255,.12)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    role: "region",
    "aria-label": title || 'LCD',
    style: {
      position: 'relative',
      minWidth: `${cols}ch`,
      minHeight: `calc(${rows} * ${fontSize} * var(--lcd-line))`,
      padding: '8px 10px',
      background: 'var(--surface-lcd)',
      borderRadius: 2,
      boxShadow: 'var(--lcd-inset)',
      fontFamily: 'var(--font-lcd)',
      fontSize,
      lineHeight: 'var(--lcd-line)',
      color: 'var(--text-lcd)',
      textTransform: 'uppercase',
      whiteSpace: 'pre',
      overflow: 'hidden',
      backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 3px, rgba(0,0,0,.05) 3px 4px)'
    }
  }, children)));
}
function LcdField({
  label,
  value,
  selected = false,
  width,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      gap: '1ch',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-lcd-dim)'
    }
  }, label, ":"), /*#__PURE__*/React.createElement("span", {
    style: {
      minWidth: width,
      background: selected ? 'var(--lcd-cursor)' : 'transparent',
      color: selected ? 'var(--surface-lcd)' : 'inherit',
      padding: '0 2px',
      margin: '0 -2px'
    }
  }, value));
}
function SoftKeys({
  keys = [],
  active,
  onSelect,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gap: 2,
      ...style
    }
  }, Array.from({
    length: 6
  }, (_, i) => {
    const k = keys[i];
    const on = active === i;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      disabled: !k,
      onClick: () => k && onSelect?.(i, k),
      style: {
        appearance: 'none',
        border: 0,
        height: 20,
        padding: 0,
        fontFamily: 'var(--font-lcd)',
        fontSize: 'var(--lcd-sm)',
        lineHeight: 1,
        textTransform: 'uppercase',
        background: on ? 'var(--lcd-ink)' : k ? 'var(--lcd-cursor)' : 'transparent',
        color: k ? 'var(--surface-lcd)' : 'transparent',
        cursor: k ? 'pointer' : 'default',
        borderRadius: 1,
        outline: 'none'
      }
    }, k || '·');
  }));
}
Object.assign(__ds_scope, { Lcd, LcdField, SoftKeys });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Lcd.jsx", error: String((e && e.message) || e) }); }

// components/display/LcdWindow.jsx
try { (() => {
function LcdWindow({
  title,
  children,
  keys = ['', '', '', '', 'CANCEL', 'DO IT'],
  onKey,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-label": title,
    style: {
      position: 'absolute',
      inset: 10,
      background: 'var(--surface-lcd)',
      border: '2px solid var(--lcd-ink)',
      boxShadow: '4px 4px 0 var(--lcd-cursor)',
      padding: '4px 8px 26px',
      fontFamily: 'var(--font-lcd)',
      fontSize: 'var(--lcd-md)',
      lineHeight: 1,
      color: 'var(--text-lcd)',
      textTransform: 'uppercase',
      whiteSpace: 'pre',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      margin: '-4px -8px 6px',
      padding: '2px 0',
      background: 'var(--lcd-ink)',
      color: 'var(--surface-lcd)'
    }
  }, `═ ${title} ═`), children, /*#__PURE__*/React.createElement(__ds_scope.SoftKeys, {
    keys: keys,
    onSelect: onKey,
    style: {
      position: 'absolute',
      left: 2,
      right: 2,
      bottom: 2
    }
  }));
}
Object.assign(__ds_scope, { LcdWindow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/LcdWindow.jsx", error: String((e && e.message) || e) }); }

// components/display/Panel.jsx
try { (() => {
function Panel({
  title,
  children,
  recessed = false,
  onDark = false,
  padding = 'var(--space-4)',
  style
}) {
  return /*#__PURE__*/React.createElement("fieldset", {
    style: {
      position: 'relative',
      margin: 0,
      padding,
      border: `var(--stroke-w) solid ${onDark ? 'var(--cream)' : 'var(--stroke)'}`,
      borderRadius: 'var(--radius-panel)',
      background: recessed ? onDark ? 'var(--navy-deep)' : 'var(--surface-panel-recessed)' : 'transparent',
      boxShadow: recessed ? 'var(--recess)' : 'none',
      minWidth: 0,
      ...style
    }
  }, title && /*#__PURE__*/React.createElement("legend", {
    style: {
      padding: '0 6px',
      marginLeft: 8,
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: 'var(--label-sm)',
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)',
      lineHeight: 1
    }
  }, title), children);
}
function Silkscreen({
  children,
  size = 'sm',
  onDark = false,
  align = 'left',
  as = 'span',
  style
}) {
  const fs = {
    xs: 'var(--label-xs)',
    sm: 'var(--label-sm)',
    md: 'var(--label-md)',
    lg: 'var(--label-lg)',
    xl: 'var(--label-xl)'
  }[size];
  return React.createElement(as, {
    style: {
      display: 'block',
      fontFamily: 'var(--font-label)',
      fontWeight: 600,
      fontSize: fs,
      letterSpacing: 'var(--label-tracking)',
      textTransform: 'uppercase',
      color: onDark ? 'var(--text-silkscreen-on-chassis)' : 'var(--text-silkscreen)',
      lineHeight: 1,
      textAlign: align,
      ...style
    }
  }, children);
}
function Wordmark({
  size = 'md',
  onDark = false,
  style
}) {
  const fs = size === 'lg' ? 'var(--display-lg)' : size === 'sm' ? 'var(--label-xl)' : 'var(--display-md)';
  return /*#__PURE__*/React.createElement("span", {
    "aria-label": "Chop Deck",
    style: {
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: '.18em',
      fontFamily: 'var(--font-label)',
      fontWeight: 700,
      fontSize: fs,
      lineHeight: 1,
      letterSpacing: '-.01em',
      textTransform: 'uppercase',
      color: onDark ? 'var(--cream)' : 'var(--ink)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red)'
    }
  }, "CHOP"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontStyle: 'italic'
    }
  }, "DECK"));
}
Object.assign(__ds_scope, { Panel, Silkscreen, Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Panel.jsx", error: String((e && e.message) || e) }); }

// components/display/Waveform.jsx
try { (() => {
const {
  useEffect,
  useRef
} = React;
function Waveform({
  data,
  chops = [],
  selected,
  playhead,
  height = 80,
  width = 480,
  style
}) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const cs = getComputedStyle(c);
    const ink = cs.getPropertyValue('--lcd-ink').trim() || '#1C2814';
    const dim = cs.getPropertyValue('--lcd-dim').trim() || '#5C6B44';
    ctx.clearRect(0, 0, width, height);
    const pts = data && data.length ? data : Array.from({
      length: 256
    }, (_, i) => Math.abs(Math.sin(i * .21) * Math.exp(-(i % 64 / 22))) * .9 + .04);
    const mid = height / 2;
    const step = width / pts.length;
    ctx.fillStyle = ink;
    pts.forEach((a, i) => {
      const h = Math.max(1, a * (height - 8));
      ctx.fillRect(i * step, mid - h / 2, Math.max(1, step - 1), h);
    });
    ctx.fillStyle = dim;
    ctx.fillRect(0, mid, width, 1);
    chops.forEach((x, i) => {
      const px = x * width;
      ctx.fillStyle = ink;
      ctx.fillRect(px, 0, i === selected ? 2 : 1, height);
      ctx.font = '12px VT323, monospace';
      ctx.fillText(String(i + 1).padStart(2, '0'), px + 3, 11);
      if (i === selected) {
        const nx = (chops[i + 1] ?? 1) * width;
        ctx.fillStyle = 'rgba(28,40,20,.18)';
        ctx.fillRect(px, 0, nx - px, height);
      }
    });
    if (playhead != null) {
      ctx.fillStyle = ink;
      ctx.fillRect(playhead * width, 0, 2, height);
    }
  }, [data, chops, selected, playhead, height, width]);
  return /*#__PURE__*/React.createElement("canvas", {
    ref: ref,
    role: "img",
    "aria-label": "Waveform",
    style: {
      width,
      height,
      display: 'block',
      imageRendering: 'pixelated',
      ...style
    }
  });
}
Object.assign(__ds_scope, { Waveform });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Waveform.jsx", error: String((e && e.message) || e) }); }

// ui_kits/chopdeck-app/Mpc.jsx
try { (() => {
// The chassis: full-app frame composing every DS control around the LCD
const {
  Pad,
  HardButton,
  Led,
  Knob,
  Fader,
  CursorPad,
  Panel,
  Silkscreen,
  Wordmark
} = window.FunMPCDesignSystem_3bf065;
const {
  useState,
  useEffect,
  useRef
} = React;
function useSequencer(s, set) {
  useEffect(() => {
    if (!s.playing) return;
    const id = setInterval(() => set(p => ({
      ...p,
      step: p.step + 1,
      litPads: window.MPC_SEQ[(p.step + 1) % 16]
    })), 60000 / s.bpm / 4);
    return () => clearInterval(id);
  }, [s.playing, s.bpm]);
}
function Mpc() {
  const [s, set] = useState({
    mode: 'MAIN',
    seqName: 'FUNKY DRUMMER',
    program: 'BREAK_93',
    bpm: 93,
    loop: true,
    playing: false,
    rec: false,
    step: 0,
    cursor: 0,
    chop: 1,
    lastPad: null,
    litPads: [],
    bank: 0,
    window: null,
    vol: 72,
    gain: 40,
    data: 500
  });
  useSequencer(s, set);
  const u = patch => set(p => ({
    ...p,
    ...(typeof patch === 'function' ? patch(p) : patch)
  }));
  const lcdRef = useRef(null);
  const [lcdW, setLcdW] = useState(560);
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(0);
  useEffect(() => {
    const r = () => {
      lcdRef.current && setLcdW(lcdRef.current.clientWidth);
      const w = wrapRef.current;
      if (w) {
        const sc = Math.min(1, w.parentElement.clientWidth / 1240);
        setScale(sc);
        setH(w.offsetHeight * sc);
      }
    };
    r();
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const hit = i => u(p => ({
    lastPad: i,
    ...(p.mode === 'CHOP' ? {
      window: {
        title: 'ASSIGN CHOP',
        keys: ['', '', '', '', 'CANCEL', 'DO IT'],
        body: [`CHOP ${String(p.chop + 1).padStart(2, '0')}  ->  PAD ${String(i + 1).padStart(2, '0')} ${window.MPC_PADS[i]}`, '', 'REPLACE SOUND ON PAD?']
      }
    } : {})
  }));
  const move = dir => u(p => ({
    cursor: dir === 'down' || dir === 'right' ? Math.min(5, p.cursor + 1) : Math.max(0, p.cursor - 1)
  }));
  const data = v => u(p => {
    const d = v - p.data;
    if (p.mode === 'MAIN' && p.cursor === 0) return {
      data: v,
      bpm: Math.max(40, Math.min(240, p.bpm + d / 10))
    };
    if (p.mode === 'CHOP') return {
      data: v,
      chop: Math.max(0, Math.min(7, Math.round(v / 1000 * 7)))
    };
    return {
      data: v
    };
  });
  const windowKey = (i, k) => u(p => {
    if (k === 'DO IT' && p.window?.title === 'LOAD A SOUND') return {
      window: null,
      program: window.MPC_FILES[p.cursor].replace('.WAV', ''),
      mode: 'SAMPLE',
      cursor: 0
    };
    return {
      window: null
    };
  });
  const openWindow = () => u(p => p.mode === 'LOAD' ? {
    window: {
      title: 'LOAD A SOUND',
      keys: ['', '', '', '', 'CANCEL', 'DO IT'],
      body: [`FILE:  ${window.MPC_FILES[p.cursor]}`, 'TYPE:  16 BIT 44.1K STEREO', 'LOAD TO: PROGRAM  BREAK_93']
    }
  } : p.mode === 'MAIN' ? {
    window: {
      title: 'SEQUENCE',
      keys: ['', '', 'RENAME', 'COPY', 'CANCEL', 'DO IT'],
      body: [`SEQ:01  ${p.seqName}`, `BPM: ${p.bpm.toFixed(1)}   BARS: 1   LOOP: ${p.loop ? 'ON' : 'OFF'}`]
    }
  } : {});
  const play = () => u(p => ({
    playing: !p.playing,
    rec: false,
    litPads: p.playing ? [] : p.litPads
  }));
  const stop = () => u({
    playing: false,
    rec: false,
    litPads: [],
    step: 0
  });
  const rec = () => u(p => ({
    rec: !p.rec,
    playing: p.rec ? p.playing : true
  }));
  const F = i => /*#__PURE__*/React.createElement(HardButton, {
    key: i,
    label: `F${i + 1}`,
    size: "sm",
    onDark: true,
    active: window.MPC_MODES[i] === s.mode,
    onClick: () => u({
      mode: window.MPC_MODES[i],
      cursor: 0,
      window: null
    })
  });
  const lbl = {
    fontFamily: 'var(--font-label)',
    fontWeight: 600,
    fontSize: 9,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'var(--cream)',
    lineHeight: 1
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: h || 'auto',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: wrapRef,
    "data-screen-label": "Chop Deck",
    style: {
      width: 1240,
      position: 'absolute',
      left: '50%',
      top: 0,
      transform: `translateX(-50%) scale(${scale})`,
      transformOrigin: 'top center',
      background: 'var(--navy) var(--texture-grain)',
      border: '3px solid var(--ink)',
      borderRadius: 'var(--radius-chassis)',
      boxShadow: 'var(--chassis-shadow)',
      padding: 22,
      boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      gap: 20,
      color: 'var(--cream)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...lbl,
      fontSize: 9,
      opacity: .8
    }
  }, "INTEGRATED RHYTHM MACHINE \xB7 16 BIT SAMPLER \xB7 SEQUENCER \xB7 RUNS IN YOUR BROWSER"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Led, {
    color: "green",
    on: s.playing,
    label: "PLAY",
    style: {
      color: 'var(--cream)'
    }
  }), /*#__PURE__*/React.createElement(Led, {
    color: "red",
    on: s.rec,
    label: "REC",
    style: {
      color: 'var(--cream)'
    }
  }), /*#__PURE__*/React.createElement(Led, {
    color: "amber",
    on: !!s.window,
    label: "WINDOW",
    style: {
      color: 'var(--cream)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    ref: lcdRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(window.MpcLcd, {
    s: s,
    lcdW: lcdW,
    onSoftKey: i => u({
      mode: window.MPC_MODES[i],
      cursor: 0,
      window: null
    }),
    onWindowKey: windowKey
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6,1fr)',
      padding: '10px 12px 0',
      justifyItems: 'center'
    }
  }, [0, 1, 2, 3, 4, 5].map(F))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 20,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "MODE",
    onDark: true,
    padding: "10px 12px",
    style: {
      minWidth: 'max-content'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, auto)',
      gap: '16px 12px'
    }
  }, [['7', 'MIDI'], ['8', 'OTHER'], ['9', 'MIXER'], ['4', 'SAMPLE'], ['5', 'TRIM'], ['6', 'PROGRAM'], ['1', 'SONG'], ['2', 'STEP'], ['3', 'LOAD'], ['SHIFT', ''], ['0', 'ENTER'], ['MAIN', '']].map(([k, m]) => /*#__PURE__*/React.createElement(HardButton, {
    key: k,
    label: m,
    onDark: true,
    size: "sm",
    cap: k === 'SHIFT' ? 'dark' : k === 'MAIN' ? 'amber' : 'key',
    active: k === 'MAIN' && s.mode === 'MAIN' || m === 'LOAD' && s.mode === 'LOAD' || m === 'SAMPLE' && s.mode === 'SAMPLE' || m === 'MIXER' && s.mode === 'MIX',
    onClick: () => {
      if (k === 'MAIN') u({
        mode: 'MAIN',
        cursor: 0,
        window: null
      });
      if (m === 'LOAD') u({
        mode: 'LOAD',
        cursor: 0
      });
      if (m === 'SAMPLE') u({
        mode: 'SAMPLE',
        cursor: 0
      });
      if (m === 'MIXER') u({
        mode: 'MIX'
      });
      if (m === 'TRIM') u({
        mode: 'CHOP'
      });
    }
  }, k)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement(Knob, {
    label: "DATA",
    size: "lg",
    ticks: false,
    min: 0,
    max: 1000,
    value: s.data,
    onChange: data,
    onDark: true
  }), /*#__PURE__*/React.createElement(CursorPad, {
    onMove: move,
    onDark: true
  }), /*#__PURE__*/React.createElement(Fader, {
    label: "NOTE VAR",
    height: 120,
    onDark: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(HardButton, {
    label: "WINDOW",
    cap: "amber",
    onDark: true,
    onClick: openWindow
  }), /*#__PURE__*/React.createElement(HardButton, {
    label: "TAP TEMPO",
    onDark: true,
    size: "lg",
    onClick: () => u(p => ({
      lastPad: p.lastPad
    }))
  }), /*#__PURE__*/React.createElement(HardButton, {
    label: "UNDO SEQ",
    onDark: true,
    onClick: () => u({
      window: null
    })
  }), /*#__PURE__*/React.createElement(HardButton, {
    label: "ERASE",
    onDark: true
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "LOCATE",
    onDark: true,
    padding: "8px 10px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(HardButton, {
    label: "STEP",
    onDark: true,
    size: "sm",
    onClick: () => u(p => ({
      step: Math.max(0, p.step - 1)
    }))
  }, "<"), /*#__PURE__*/React.createElement(HardButton, {
    label: "",
    onDark: true,
    size: "sm",
    onClick: () => u(p => ({
      step: p.step + 1
    }))
  }, ">"), /*#__PURE__*/React.createElement(HardButton, {
    label: "GO TO",
    onDark: true,
    size: "sm",
    onClick: () => u({
      step: 0
    })
  }), /*#__PURE__*/React.createElement(HardButton, {
    label: "BAR",
    onDark: true,
    size: "sm"
  }, "<<"), /*#__PURE__*/React.createElement(HardButton, {
    label: "",
    onDark: true,
    size: "sm"
  }, ">>"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(HardButton, {
    label: "REC",
    cap: "red",
    led: "red",
    ledOn: s.rec,
    size: "lg",
    onDark: true,
    onClick: rec
  }), /*#__PURE__*/React.createElement(HardButton, {
    label: "OVER DUB",
    cap: "red",
    led: "red",
    ledOn: s.rec && s.playing,
    size: "lg",
    onDark: true,
    onClick: rec
  }), /*#__PURE__*/React.createElement(HardButton, {
    label: "STOP",
    size: "lg",
    onDark: true,
    onClick: stop
  }, "\u25A0"), /*#__PURE__*/React.createElement(HardButton, {
    label: "PLAY",
    size: "lg",
    led: "green",
    ledOn: s.playing,
    onDark: true,
    onClick: play
  }, "\u25BA"), /*#__PURE__*/React.createElement(HardButton, {
    label: "PLAY START",
    size: "lg",
    onDark: true,
    onClick: () => u({
      step: 0,
      playing: true
    })
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo.webp",
    alt: "",
    style: {
      width: 44,
      height: 44
    }
  }), /*#__PURE__*/React.createElement(Wordmark, {
    onDark: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(Knob, {
    label: "REC GAIN",
    size: "sm",
    ticks: false,
    value: s.gain,
    onChange: v => u({
      gain: v
    }),
    onDark: true
  }), /*#__PURE__*/React.createElement(Knob, {
    label: "MAIN VOLUME",
    size: "sm",
    ticks: false,
    value: s.vol,
    onChange: v => u({
      vol: v
    }),
    onDark: true
  }))), /*#__PURE__*/React.createElement(Panel, {
    title: "PAD BANK",
    onDark: true,
    padding: "8px 12px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      justifyContent: 'space-between'
    }
  }, ['A', 'B', 'C', 'D'].map((b, i) => /*#__PURE__*/React.createElement(HardButton, {
    key: b,
    label: b,
    size: "sm",
    led: "green",
    ledOn: s.bank === i,
    onDark: true,
    onClick: () => u({
      bank: i
    })
  })), /*#__PURE__*/React.createElement(HardButton, {
    label: "FULL LEVEL",
    size: "sm",
    onDark: true
  }), /*#__PURE__*/React.createElement(HardButton, {
    label: "16 LEVELS",
    size: "sm",
    onDark: true
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--cream)',
      border: 'var(--stroke-w) solid var(--ink)',
      borderRadius: 'var(--radius-panel)',
      padding: 14,
      boxShadow: 'inset 0 2px 6px rgba(0,0,0,.25)',
      display: 'grid',
      gridTemplateColumns: 'repeat(4, var(--pad-size))',
      gap: 'var(--pad-gap)',
      justifyContent: 'center'
    }
  }, [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].map(i => /*#__PURE__*/React.createElement(Pad, {
    key: i,
    label: `PAD ${i + 1}`,
    note: window.MPC_NOTES[i],
    lit: s.litPads.includes(i),
    onTrigger: () => hit(i)
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      ...lbl,
      opacity: .7,
      textAlign: 'center'
    }
  }, "BANK ", ['A', 'B', 'C', 'D'][s.bank], " \xB7 ", s.program, " \xB7 HIT A PAD, PRESS PLAY"))));
}
Object.assign(window, {
  Mpc
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/chopdeck-app/Mpc.jsx", error: String((e && e.message) || e) }); }

// ui_kits/chopdeck-app/Screens.jsx
try { (() => {
// LCD screens — each renders the content of one firmware "mode" inside <Lcd>
const {
  Lcd,
  LcdField,
  SoftKeys,
  LcdWindow,
  Waveform
} = window.FunMPCDesignSystem_3bf065;
const pad2 = n => String(n).padStart(2, '0');
const MODES = ['MAIN', 'TRACK', 'SAMPLE', 'CHOP', 'LOAD', 'MIX'];
function MainScreen({
  s
}) {
  const bar = Math.floor(s.step / 16) + 1,
    beat = Math.floor(s.step % 16 / 4) + 1,
    tick = s.step % 4 * 24;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "SEQ:01-", s.seqName.padEnd(16), "   NOW:", pad2(bar).padStart(3, '0'), ".", pad2(beat), ".", pad2(tick)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(LcdField, {
    label: "BPM",
    value: s.bpm.toFixed(1),
    selected: s.cursor === 0
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "LOOP",
    value: s.loop ? 'ON ' : 'OFF',
    selected: s.cursor === 1
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "BARS",
    value: "1",
    selected: s.cursor === 2
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "TSIG",
    value: "4/4"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--lcd-dim)'
    }
  }, "TR:01-DRUMS        PGM:", s.program), /*#__PURE__*/React.createElement("div", null, s.rec ? '● REC' : s.playing ? '► PLAY' : '■ STOP', "     PAD:", s.lastPad != null ? `${pad2(s.lastPad + 1)} ${window.MPC_PADS[s.lastPad]}` : '--'), /*#__PURE__*/React.createElement("div", {
    style: {
      letterSpacing: 2
    }
  }, Array.from({
    length: 16
  }, (_, i) => i === s.step % 16 && s.playing ? '▮' : window.MPC_SEQ[i].length ? '▪' : '·').join('')));
}
function TrackScreen({
  s
}) {
  const rows = [['01', 'DRUMS', 'BREAK_93', 'ON '], ['02', 'BASS', '808_KIT', 'ON '], ['03', 'KEYS', 'RHODES_C', 'MUTE'], ['04', '(UNUSED)', '--------', '   ']];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "TRACK MUTE            SEQ:01-", s.seqName), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--lcd-dim)'
    }
  }, "TR  NAME      PROGRAM    STATE"), rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: i === s.cursor ? {
      background: 'var(--lcd-cursor)',
      color: 'var(--lcd)'
    } : null
  }, r[0], "  ", r[1].padEnd(9), " ", r[2].padEnd(10), " ", r[3])));
}
function SampleScreen({
  s
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "SAMPLE:", s.program.padEnd(14), "  ", pad2(s.lastPad != null ? s.lastPad + 1 : 1), " ", window.MPC_PADS[s.lastPad ?? 0]), /*#__PURE__*/React.createElement(Waveform, {
    data: window.MPC_PEAKS,
    playhead: s.playing ? s.step % 16 / 16 : undefined,
    width: s.lcdW - 24,
    height: 60
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(LcdField, {
    label: "ST",
    value: "0000000",
    selected: s.cursor === 0
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "END",
    value: "0412160",
    selected: s.cursor === 1
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "LEVEL",
    value: "100",
    selected: s.cursor === 2
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(LcdField, {
    label: "TUNE",
    value: "+00.00"
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "LOOP",
    value: "OFF"
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "LENGTH",
    value: "9.35S"
  })));
}
function ChopScreen({
  s
}) {
  const c = window.MPC_CHOPS;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "CHOP SHOP   ", s.program.padEnd(12), "  REGIONS:", pad2(c.length)), /*#__PURE__*/React.createElement(Waveform, {
    data: window.MPC_PEAKS,
    chops: c,
    selected: s.chop,
    width: s.lcdW - 24,
    height: 60
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(LcdField, {
    label: "CHOP",
    value: `${pad2(s.chop + 1)}/${pad2(c.length)}`,
    selected: true
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "ST",
    value: String(Math.round(c[s.chop] * 412160)).padStart(7, '0')
  }), "  ", /*#__PURE__*/React.createElement(LcdField, {
    label: "END",
    value: String(Math.round((c[s.chop + 1] ?? 1) * 412160)).padStart(7, '0')
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--lcd-dim)'
    }
  }, "DATA WHEEL MOVES CHOP \xB7 PAD ASSIGNS \xB7 F6 CONVERTS"));
}
function LoadScreen({
  s
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "LOAD                 DRIVE:BROWSER  FREE:16.0MB"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--lcd-dim)'
    }
  }, "DROP A WAV/MP3 HERE OR PICK A FILE"), window.MPC_FILES.map((f, i) => /*#__PURE__*/React.createElement("div", {
    key: f,
    style: i === s.cursor ? {
      background: 'var(--lcd-cursor)',
      color: 'var(--lcd)'
    } : null
  }, i === s.cursor ? '►' : ' ', " ", f.padEnd(18), " ", ['1.2MB', '3.4MB', '0.3MB', '2.1MB', '4.0MB', '0.9MB'][i])));
}
function MixScreen({
  s
}) {
  const lv = [100, 92, 100, 88, 76, 60, 84, 84, 100, 100, 100, 100, 95, 95, 95, 95];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, "MIXER               PGM:", s.program), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      marginTop: 4
    }
  }, lv.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      width: `calc((100% - 60px) / 16)`,
      height: 56,
      display: 'flex',
      alignItems: 'flex-end',
      borderBottom: '1px solid var(--lcd-ink)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      height: `${v * (i === (s.lastPad ?? -1) ? 1 : .8)}%`,
      background: i === s.lastPad ? 'var(--lcd-ink)' : 'var(--lcd-dim)'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--lcd-sm)',
      letterSpacing: '.1ch'
    }
  }, Array.from({
    length: 16
  }, (_, i) => pad2(i + 1)).join(' ')));
}
const SCREENS = {
  MAIN: MainScreen,
  TRACK: TrackScreen,
  SAMPLE: SampleScreen,
  CHOP: ChopScreen,
  LOAD: LoadScreen,
  MIX: MixScreen
};
function MpcLcd({
  s,
  onSoftKey,
  onWindowKey,
  lcdW
}) {
  const Screen = SCREENS[s.mode];
  return /*#__PURE__*/React.createElement(Lcd, {
    cols: 46,
    rows: 7,
    style: {
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: lcdW - 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      paddingBottom: 26
    }
  }, /*#__PURE__*/React.createElement(Screen, {
    s: {
      ...s,
      lcdW
    }
  })), /*#__PURE__*/React.createElement(SoftKeys, {
    keys: MODES,
    active: MODES.indexOf(s.mode),
    onSelect: onSoftKey,
    style: {
      position: 'absolute',
      left: 6,
      right: 6,
      bottom: 6
    }
  }), s.window && /*#__PURE__*/React.createElement(LcdWindow, {
    title: s.window.title,
    keys: s.window.keys,
    onKey: onWindowKey
  }, s.window.body.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, l))));
}
Object.assign(window, {
  MpcLcd,
  MPC_MODES: MODES
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/chopdeck-app/Screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/chopdeck-app/data.js
try { (() => {
// Shared fake state + data for the Chop Deck kit
const PADS = ['KICK', 'SNARE', 'HAT CL', 'HAT OP', 'CLAP', 'RIM', 'TOM LO', 'TOM HI', 'CHOP 1', 'CHOP 2', 'CHOP 3', 'CHOP 4', 'CHOP 5', 'CHOP 6', 'CHOP 7', 'CHOP 8'];
const NOTES = ['A8', 'B9', 'C10', 'D11', 'E12', 'F13', 'G14', 'H15', 'I16', 'J17', 'K18', 'L19', 'M20', 'N21', 'O22', 'P23'];
// 16 steps × 16 pads pattern (pad index list per step)
const SEQ = [[0, 2], [2], [2, 4], [2], [1, 2], [2], [0, 2], [2, 3], [0, 2], [2], [2, 4], [0, 2], [1, 2], [2], [2, 5], [3]];
const CHOPS = [0, .13, .27, .38, .52, .64, .78, .9];
const FILES = ['BREAK_93.WAV', 'SOUL_LOOP_A.WAV', 'VOX_STAB.WAV', 'RHODES_C.WAV', '808_KIT.WAV', 'VINYL_NOISE.WAV'];
const peaks = Array.from({
  length: 320
}, (_, i) => {
  const t = i / 320;
  const hit = CHOPS.reduce((m, c) => Math.max(m, Math.exp(-Math.max(0, t - c) * 18) * (t >= c ? 1 : 0)), 0);
  return Math.min(1, hit * .95 + Math.abs(Math.sin(i * 1.7)) * .12 + .03);
});
Object.assign(window, {
  MPC_PADS: PADS,
  MPC_NOTES: NOTES,
  MPC_SEQ: SEQ,
  MPC_CHOPS: CHOPS,
  MPC_FILES: FILES,
  MPC_PEAKS: peaks
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/chopdeck-app/data.js", error: String((e && e.message) || e) }); }

__ds_ns.CursorPad = __ds_scope.CursorPad;

__ds_ns.Fader = __ds_scope.Fader;

__ds_ns.HardButton = __ds_scope.HardButton;

__ds_ns.Knob = __ds_scope.Knob;

__ds_ns.Led = __ds_scope.Led;

__ds_ns.Pad = __ds_scope.Pad;

__ds_ns.Lcd = __ds_scope.Lcd;

__ds_ns.LcdField = __ds_scope.LcdField;

__ds_ns.SoftKeys = __ds_scope.SoftKeys;

__ds_ns.LcdWindow = __ds_scope.LcdWindow;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.Silkscreen = __ds_scope.Silkscreen;

__ds_ns.Wordmark = __ds_scope.Wordmark;

__ds_ns.Waveform = __ds_scope.Waveform;

})();
