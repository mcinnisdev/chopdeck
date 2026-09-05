// Tooltip copy for every front-panel control, each deep-linking into the owner's manual.
export interface HelpEntry { title: string; text: string; anchor: string }

export const MANUAL_URL = '/manual/';

export const HELP: Record<string, HelpEntry> = {
  pads: { title: 'Drum pads', text: 'Hit to play the sound assigned in the current program. Velocity comes from where you strike (or key Z X C V, A S D F, Q W E R, 1 2 3 4). Hold with NOTE REPEAT for rolls.', anchor: 'pads' },
  bank: { title: 'PAD BANK', text: 'Four banks of 16 pads: A01 to D16. Each bank plays a different set of notes in the program.', anchor: 'pads' },
  fullLevel: { title: 'FULL LEVEL', text: 'Every pad hit plays at maximum velocity (127) while the LED is on. In the Name window it toggles upper and lower case.', anchor: 'full-level' },
  sixteenLevels: { title: '16 LEVELS', text: 'Spread one sound over the 16 pads in steps of velocity, tuning, decay, attack or filter. Press to set up, press again to turn off.', anchor: 'sixteen-levels' },
  nextSeq: { title: 'NEXT SEQ', text: 'Queue the sequence that plays after the current one ends. SUDDEN switches immediately; PAD picks a sequence from the pads.', anchor: 'next-sequence' },
  trackMute: { title: 'TRACK MUTE', text: 'Turn tracks on and off from the pads while the sequence plays. Hold SOLO and hit a pad to solo a track.', anchor: 'track-mute' },
  recGain: { title: 'REC GAIN', text: 'Input level for SAMPLE mode. Watch the meter and keep the peaks out of the top segment.', anchor: 'sampling' },
  volume: { title: 'MAIN VOLUME', text: 'Master output level of the machine.', anchor: 'basics' },
  f: { title: 'Function keys', text: 'F1 to F6 press the six soft keys printed on the bottom line of the LCD. Reversed labels jump to a page; framed labels run an action.', anchor: 'soft-keys' },
  mode: { title: 'MODE keypad', text: 'Hold SHIFT and press a number to change mode, as printed above each key: 1 SONG, 2 MISC, 3 LOAD, 4 SAMPLE, 5 TRIM, 6 PROGRAM, 7 MIXER, 8 OTHER, 9 MIDI/SYNC, 0 SAVE. Without SHIFT the keys type numbers into the field under the cursor; ENTER confirms.', anchor: 'modes' },
  main: { title: 'MAIN SCREEN', text: 'Back to the main sequencer screen from anywhere, closing any window.', anchor: 'main-screen' },
  window: { title: 'OPEN WINDOW', text: 'Open the settings window for the field under the cursor. Most fields have one. Press again to close it.', anchor: 'windows' },
  data: { title: 'DATA wheel', text: 'Turn to change the field under the cursor. Faster turns move in bigger steps. Scroll on it with the mouse wheel, or use [ and ] on the keyboard.', anchor: 'data-wheel' },
  cursor: { title: 'CURSOR', text: 'Move between the fields on the LCD. Only data fields can be landed on.', anchor: 'cursor' },
  after: { title: 'AFTER / ASSIGN', text: 'AFTER lets the NOTE VARIATION slider shape notes as the sequence plays back. SHIFT + AFTER opens the ASSIGN screen where you choose which note and parameter the slider controls.', anchor: 'note-variation' },
  nv: { title: 'NOTE VARIATION slider', text: 'Bends one parameter of the assigned note in real time: tuning, decay, attack or filter. The position is recorded with each hit.', anchor: 'note-variation' },
  tap: { title: 'TAP TEMPO / NOTE REPEAT', text: 'Tap on the beat to set the tempo. Hold it while playing and hold a pad to repeat the pad at the Timing value; pad pressure sets the velocity.', anchor: 'tap-tempo' },
  undo: { title: 'UNDO SEQ', text: 'Take back the last recording or edit of the sequence. Press again to redo. Only valid right after the take.', anchor: 'undo' },
  erase: { title: 'ERASE', text: 'While overdubbing, hold ERASE and a pad to erase that sound as the sequence plays over it. While stopped, it opens the Erase window for a range, a track or one event type.', anchor: 'erase' },
  step: { title: 'STEP < >', text: 'Move the position by one Timing value (or one tick when Timing is OFF). With GO TO held: jump to the previous or next event on the track.', anchor: 'locate' },
  goto: { title: 'GO TO', text: 'Tap to open the Locate window with nine stored positions. Hold with BAR << or >> to jump to the start or end.', anchor: 'locate' },
  bar: { title: 'BAR << >>', text: 'Move the position one bar back or forward. With GO TO held: start or end of the sequence.', anchor: 'locate' },
  rec: { title: 'REC', text: 'Arm recording: press REC then PLAY (or PLAY START). REC replaces what was on the track as the position passes over it. Pressing it during playback punches in and out.', anchor: 'recording' },
  overdub: { title: 'OVER DUB', text: 'Like REC, but adds to what is already on the track. A looping REC take switches to OVER DUB after the first pass by itself.', anchor: 'recording' },
  stop: { title: 'STOP', text: 'Stop playback and recording. The position stays where you stopped.', anchor: 'transport' },
  play: { title: 'PLAY', text: 'Play from the current position (Now:).', anchor: 'transport' },
  playStart: { title: 'PLAY START', text: 'Play from the first bar. In SONG mode it starts the song from step 1.', anchor: 'transport' },
  lcd: { title: 'The LCD', text: 'Everything happens here: fields, windows and the six soft keys on the bottom line. The cursor is the reversed block.', anchor: 'lcd' },
  manual: { title: "Owner's Manual", text: 'The full manual: every mode, every window, and a keyboard reference.', anchor: '' },
};
