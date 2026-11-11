import { Chessboard, COLOR, INPUT_EVENT_TYPE } from '../vendor/cm-chessboard/src/Chessboard.js';
export { COLOR, INPUT_EVENT_TYPE };
export function makeBoard(el, fen, color) {
  el.innerHTML = '';
  return new Chessboard(el, {
    position: fen, orientation: color === 'b' ? COLOR.black : COLOR.white,
    assetsUrl: 'vendor/cm-chessboard/assets/', style: { pieces: { file: 'pieces/standard.svg' } }
  });
}
