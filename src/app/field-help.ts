// Tooltip copy for LCD fields. Keys are "SCREEN_ID:fieldId"; "*:fieldId" applies on any screen.
// Anything not listed still gets a contextual fallback built from the label and the mode.
import type { HelpEntry } from './help';
import type { ModeId } from '@/kernel/keys';

const F: Record<string, string> = {
  // MAIN
  'MAIN:seq': 'The sequence you are working on, 01 to 99. Names in parentheses are unused. While playing, this queues the next sequence. OPEN WINDOW: rename, delete, copy.',
  'MAIN:seqName': 'Turn the wheel or hit a pad to open the Name window and rename the sequence.',
  'MAIN:now': 'The position in bar.beat.tick (96 ticks per beat). Turn to move; type a bar number and ENTER to jump there.',
  'MAIN:tempo': 'Tempo in BPM. Type it without the decimal point: 935 then ENTER = 93.5. OPEN WINDOW: tempo changes inside the sequence.',
  'MAIN:tempoSrc': 'MAS uses the master tempo shared by every sequence; SEQ keeps a tempo in this sequence.',
  'MAIN:timing': 'The quantise grid for recording, note repeat and the STEP keys. OFF records exactly what you play. OPEN WINDOW: quantise what is already recorded, with swing.',
  'MAIN:tsig': 'Time signature. Turning the wheel opens the Change Tsig window.',
  'MAIN:count': 'Count-in before recording. OPEN WINDOW: count-in mode, metronome, click sound, wait for key.',
  'MAIN:loop': 'Repeat the sequence (or a range of bars) while playing and recording. OPEN WINDOW: first and last bar.',
  'MAIN:bars': 'Length of the sequence in bars. Turn the wheel to add or trim bars; IN/DEL inserts or deletes in the middle.',
  'MAIN:track': 'The current track, 01 to 64. Pads and recording go here. OPEN WINDOW: rename, delete, copy.',
  'MAIN:trackName': 'Turn the wheel or hit a pad to rename the track.',
  'MAIN:on': 'Track on or off. Off tracks are silent. OPEN WINDOW: erase every track that is off.',
  'MAIN:pgm': 'MIDI program change sent for this track when the sequence is selected. OFF sends nothing.',
  'MAIN:type': 'What the track drives: DRUM1 to DRUM4 play the program in that slot; MIDI sends to external gear.',
  'MAIN:channel': 'MIDI output channel for the track: 1A to 16A on port A, 1B to 16B on port B. OFF sends nothing.',
  'MAIN:velo': 'Playback velocity scaling for the track, 100 = as recorded. OPEN WINDOW: change the recorded velocities.',
  // shared window fields
  '*:from': 'Start of the time range this action works on.',
  '*:to': 'End of the time range this action works on.',
  '*:note': 'Limit the action to one pad (hit it) or ALL.',
  '*:lo': 'Lowest MIDI note the action applies to.', '*:hi': 'Highest MIDI note the action applies to.',
  '*:name': 'Turn the wheel or hit a pad to edit the name.',
  '*:default': 'The name new items start with; a number is added automatically.',
  'MAIN/TIMING_CORRECT:value': 'The grid to move notes onto.', 'MAIN/TIMING_CORRECT:swing': 'Delay every second grid position: 50 is straight, 62 to 66 is the classic feel.',
  'MAIN/TIMING_CORRECT:shift': 'Push the corrected notes earlier or later than the grid.', 'MAIN/TIMING_CORRECT:amount': 'How many ticks to shift, up to half a grid step.',
  'MAIN/LOOP:first': 'First bar of the loop.', 'MAIN/LOOP:last': 'Last bar of the loop; END follows the sequence length.', 'MAIN/LOOP:count': 'Length of the loop in bars.',
  'MAIN/CHANGE_BARS:new': 'The new length. More bars are added blank at the end; fewer truncates.',
  'MAIN/TEMPO_CHANGE:on': 'Use the tempo change list below during playback.', 'MAIN/TEMPO_CHANGE:init': 'The tempo the percentages below multiply.',
  'MAIN/COUNT:countIn': 'One bar of clicks before starting: never, before recording and playback, or only before recording.',
  'MAIN/COUNT:inPlay': 'Metronome audible during playback.', 'MAIN/COUNT:inRec': 'Metronome audible while recording.', 'MAIN/COUNT:rate': 'Note value of the click.', 'MAIN/COUNT:wait': 'Recording starts on your first pad hit instead of immediately.',
  'MAIN/METRONOME_SOUND:sound': 'A click, or the accent and normal notes of a drum program.', 'MAIN/METRONOME_SOUND:vol': 'Click volume.',
  'MAIN/EDIT_VELOCITY:type': 'Add to, subtract from, scale by a percentage, or set the velocities.', 'MAIN/EDIT_VELOCITY:value': 'The amount for the edit type.',
  'MAIN/ERASE:track': 'The track to erase; 0 erases all tracks.', 'MAIN/ERASE:mode': 'Erase everything, everything except one type, or only one type of event.', 'MAIN/ERASE:kind': 'The event type for ALL EXCEPT / ONLY ERASE.',
  'LOCATE:goto': 'A position to jump to with GO TO. The nine memories below can be stored with STORE.',
  'MAIN/BARS_INDEL:after': 'Insert blank bars after this bar (0 = at the start).', 'MAIN/BARS_INDEL:count': 'How many bars to insert.', 'MAIN/BARS_INDEL:first': 'First bar to delete.', 'MAIN/BARS_INDEL:last': 'Last bar to delete.',
  'MAIN/CHANGE_TSIG:first': 'First bar to change.', 'MAIN/CHANGE_TSIG:last': 'Last bar to change.', 'MAIN/CHANGE_TSIG:num': 'Beats per bar.', 'MAIN/CHANGE_TSIG:den': 'Note value of one beat.',
  'MAIN/TIME_DISPLAY:style': 'Show positions as bars and beats or as clock time.',
  // STEP
  '*:view': 'Which event types the list shows.',
  'STEP:now': 'The position whose events are listed. STEP < and > walk through time.',
  // PROGRAM
  '*:pgm': 'The program being edited; changing it also binds it to the DRUM slot.',
  'PROGRAM/ASSIGN:pad': 'The pad being assigned. Hit a pad to select it.', 'PROGRAM/ASSIGN:noteOfPad': 'The note number this pad plays.',
  'PROGRAM/ASSIGN:padAssign': 'PROGRAM keeps a pad map per program; MASTER shares one map between programs.',
  'PROGRAM/ASSIGN:snd': 'The sound on this note. Turn the wheel through the sounds in memory; OFF plays nothing.',
  'PROGRAM/ASSIGN:mode': 'NORMAL plays one sound. SIMULT layers two more notes. VEL SW switches note by velocity. DCY SW switches by the decay value (open and closed hat on one pad).',
  'PROGRAM/PARAMS:attack': 'Fade-in time, 0 to 100. Drums usually 0.', 'PROGRAM/PARAMS:decay': 'Fade-out time, 0 to 100. Lower it to tighten a sound.',
  'PROGRAM/PARAMS:dcyMode': 'END: the fade finishes at the end of the sample. START: it begins right after the attack and shortens the sound.',
  'PROGRAM/PARAMS:freq': 'Low-pass filter cutoff, 0 dark to 100 open.', 'PROGRAM/PARAMS:reson': 'Filter resonance: emphasis at the cutoff.',
  'PROGRAM/PARAMS:tune': 'Pitch in tenths of a semitone, -120 to +120. Speed changes with pitch.',
  'PROGRAM/PARAMS:overlap': 'POLY lets hits overlap. MONO cuts the previous hit. NOTE OFF stops the sound when the pad is released.',
  // TRIM
  '*:snd': 'The sound being edited. Turn the wheel, or hit a pad that has it. OPEN WINDOW: rename, delete, copy, convert.',
  '*:playx': 'What PLAY X auditions: the whole region, the zone, or the audio before the start, before the loop, or after the end.',
  'TRIM/TRIM:st': 'Start point in samples. SHIFT + CURSOR moves coarsely. OPEN WINDOW: fine adjust with zoom.', 'TRIM/TRIM:end': 'End point in samples. OPEN WINDOW: fine adjust with zoom.',
  'TRIM/LOOP:to': 'Where the loop restarts.', 'TRIM/LOOP:lngth': 'Length of the loop.', 'TRIM/LOOP:loop': 'Sustain the loop while a pad is held.',
  'TRIM/ZONE:zst': 'Start of the current zone; the previous zone ends here.', 'TRIM/ZONE:zend': 'End of the current zone; the next zone starts here.',
  'TRIM/ZONE:zone': 'The zone being edited. OPEN WINDOW: how many equal zones to divide the sound into.',
  'TRIM/PARAMS:level': 'Playback level of the sound.', 'TRIM/PARAMS:tune': 'Pitch and speed of the sound, in tenths of a semitone.', 'TRIM/PARAMS:beat': 'Beats in the loop, used to work out its tempo.',
  'TRIM/EDIT:op': 'The operation DO IT performs on the start-to-end region.', 'TRIM/EDIT:ratio': 'New length as a percentage of the old, 50 to 200. Pitch stays the same.',
  'TRIM/EDIT:preset': 'Material type; sets the grain the stretch works with.', 'TRIM/EDIT:quality': 'A is best, C is the rough one.', 'TRIM/EDIT:margin': 'Extra samples added to the end of every slice.', 'TRIM/EDIT:pgm': 'Also make a program with the slices on pads 1 to 16.',
  // MIXER
  '*:vol': 'Level, 0 to 100.', '*:pan': 'Stereo position: L50 to MID to R50.', '*:fx': 'Effect bus for this note.', '*:send': 'How much of the note goes to the effect bus.',
  'MIXER/SETUP:master': 'Master output trim in dB.', 'MIXER/SETUP:recmix': 'Record mixer moves into the sequence as events.',
  'MIXER/FXEDIT:sel': 'Which effect to edit: one of the two multi-effect chains or one of the two reverbs.',
  // SAMPLE
  'SAMPLE:input': 'ANALOG records your microphone or line input; RESAMPLE records what the machine plays.', 'SAMPLE:mode': 'Record mono from the left or right input, or stereo.',
  'SAMPLE:monitor': 'Hear the input while sampling.', 'SAMPLE:threshold': 'Recording starts when the input passes this level; OFF starts at once.',
  'SAMPLE:time': 'Maximum length of the take.', 'SAMPLE:prerec': 'Milliseconds kept from before the threshold was crossed, so attacks are not clipped.',
  // SONG
  'SONG:song': 'The song, 01 to 20. OPEN WINDOW: rename, delete, copy.', 'SONG:tsrc': 'MAS plays the whole song at the tempo below; SEQ lets each sequence keep its own.', 'SONG:loop': 'Repeat a range of steps. OPEN WINDOW: which steps.',
  // DISK
  'LOAD:file': 'The file to load. Turn the wheel through the folder; DO IT loads it, or enters a folder. OPEN WINDOW: the directory.',
  'LOAD:device': 'BROWSER is the disk kept inside your browser; IMPORT lists files you dropped or picked.',
  'LOAD/SAVE:type': 'What to save: sequences and songs, one sequence (also as a MIDI file), programs and sounds, one sound, a mixdown, or the whole project.',
  'LOAD/SAVE:name': 'The file name. Turn the wheel or hit a pad to edit it.', 'LOAD/SAVE:target': 'BROWSER writes to the disk in your browser; DOWNLOAD hands the file to your computer.',
  'LOAD/SAVE:midi': 'Save the sequence natively or as a standard MIDI file for other software.', 'LOAD/SAVE:with': 'Include the sounds in the file or only the program settings.', 'LOAD/SAVE:src': 'Render one pass of the current sequence, or the whole song.',
  // MIDI / OTHER
  'MIDI/SYNC:inMode': 'Follow an external MIDI clock for tempo, start and stop.', 'MIDI/SYNC:outMode': 'Send MIDI clock, start and stop from output A.',
  'MIDI/PORTS:in': 'The MIDI device that plays the pads and records onto tracks.', 'MIDI/PORTS:outA': 'Device for output A (channels 1A to 16A and MIDI clock).', 'MIDI/PORTS:outB': 'Device for output B (channels 1B to 16B).',
  'OTHER/OTHERS:tap': 'How many taps TAP TEMPO averages.',
  'EDIT/EVENTS:op': 'The edit DO IT performs on the time range of the current track.', 'EDIT/EVENTS:toSeq': 'Destination sequence for the copy.', 'EDIT/EVENTS:toTr': 'Destination track for the copy.', 'EDIT/EVENTS:mode': 'REPLACE clears the destination range first; MERGE adds to it.', 'EDIT/EVENTS:start': 'Where the copy lands.', 'EDIT/EVENTS:copies': 'How many copies, back to back.',
  'EDIT/EVENTS:amount': 'Semitones to transpose MIDI tracks by; drum tracks are never transposed.',
  'MISC/PUNCH:mode': 'Punch in only, out only, or both.', 'MISC/PUNCH:in': 'Recording starts here.', 'MISC/PUNCH:out': 'Recording stops here.',
  'MISC/TRANS:tr': 'Track to transpose; 00 transposes all MIDI tracks.', 'MISC/TRANS:amount': 'Semitones. Applied on playback until FIX writes it into the notes.',
  'MISC/2NDSEQ:sq': 'A sequence that plays at the same time as the active one.',
  'NEXT_SEQ:next': 'The sequence that follows the current one. SUDDEN switches now.',
};

const MODE_ANCHOR: Record<ModeId, string> = {
  MAIN: 'main-screen', STEP: 'step-edit', EDIT: 'edit-screen', TRACK_MUTE: 'track-mute', NEXT_SEQ: 'next-sequence', ASSIGN: 'note-variation',
  SONG: 'song', MISC: 'misc', LOAD: 'disk', SAVE: 'disk', SAMPLE: 'sampling', TRIM: 'trim', PROGRAM: 'programs', MIXER: 'mixer', OTHER: 'other', MIDI: 'midi',
};
const SCREEN_ANCHOR: Record<string, string> = {
  'MAIN/TIMING_CORRECT': 'timing', 'MAIN/LOOP': 'loop', 'MAIN/COUNT': 'count', 'MAIN/METRONOME_SOUND': 'count', 'MAIN/TEMPO_CHANGE': 'tempo-change', 'MAIN/CHANGE_TSIG': 'tsig',
  'MAIN/ERASE': 'erase', LOCATE: 'locate', 'MAIN/EDIT_VELOCITY': 'main-screen', 'PROGRAM/ASSIGN': 'assign', 'PROGRAM/PARAMS': 'note-params', 'PROGRAM/DRUM': 'drum',
  'TRIM/LOOP': 'loop-page', 'TRIM/ZONE': 'zone', 'TRIM/PARAMS': 'params', 'TRIM/EDIT': 'edit-sound', 'TRIM/SOUND': 'sound-window', 'MIXER/FXSEND': 'mixer', 'MIXER/FXEDIT': 'mixer',
  'LOAD/SAVE': 'disk', 'EDIT/USER': 'user', 'MIDI/PORTS': 'midi', 'MIDI/MIDISW': 'midi',
};

export function fieldHelp(screenId: string, fieldId: string, label: string | undefined, mode: ModeId, value: string): HelpEntry {
  const text = F[`${screenId}:${fieldId}`] ?? F[`*:${fieldId}`] ?? 'A data field. Put the cursor on it and turn the DATA wheel, or type a number and press ENTER. OPEN WINDOW may have more settings.';
  const clean = (label ?? '').replace(/[:=]$/, '').trim();
  const title = clean ? `${clean}: ${value.trim()}` : value.trim() || fieldId;
  const anchor = SCREEN_ANCHOR[screenId] ?? MODE_ANCHOR[mode] ?? 'lcd';
  return { title, text, anchor };
}
