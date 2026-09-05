// Shared fake state + data for the Chop Deck kit
const PADS = ['KICK','SNARE','HAT CL','HAT OP','CLAP','RIM','TOM LO','TOM HI','CHOP 1','CHOP 2','CHOP 3','CHOP 4','CHOP 5','CHOP 6','CHOP 7','CHOP 8'];
const NOTES = ['A8','B9','C10','D11','E12','F13','G14','H15','I16','J17','K18','L19','M20','N21','O22','P23'];
// 16 steps × 16 pads pattern (pad index list per step)
const SEQ = [[0,2],[2],[2,4],[2],[1,2],[2],[0,2],[2,3],[0,2],[2],[2,4],[0,2],[1,2],[2],[2,5],[3]];
const CHOPS = [0, .13, .27, .38, .52, .64, .78, .9];
const FILES = ['BREAK_93.WAV','SOUL_LOOP_A.WAV','VOX_STAB.WAV','RHODES_C.WAV','808_KIT.WAV','VINYL_NOISE.WAV'];
const peaks = Array.from({ length: 320 }, (_, i) => { const t = i / 320; const hit = CHOPS.reduce((m, c) => Math.max(m, Math.exp(-Math.max(0, t - c) * 18) * (t >= c ? 1 : 0)), 0); return Math.min(1, hit * .95 + Math.abs(Math.sin(i * 1.7)) * .12 + .03); });
Object.assign(window, { MPC_PADS: PADS, MPC_NOTES: NOTES, MPC_SEQ: SEQ, MPC_CHOPS: CHOPS, MPC_FILES: FILES, MPC_PEAKS: peaks });
