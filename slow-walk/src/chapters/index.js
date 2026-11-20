import ch01 from './ch01.js';
import ch02 from './ch02.js';
import ch03 from './ch03.js';
import ch04 from './ch04.js';
import ch05 from './ch05.js';
import ch06 from './ch06.js';
import ch07 from './ch07.js';
import ch08 from './ch08.js';
import ch09 from './ch09.js';
import ch10 from './ch10.js';

export const chapters = [ch01, ch02, ch03, ch04, ch05, ch06, ch07, ch08, ch09, ch10];

if (chapters.some((chapter, index) => chapter.id !== index + 1 || chapter.layers.length !== 6)) {
  throw new Error('章節資料必須依序提供十章與六層視差。');
}

export default chapters;
