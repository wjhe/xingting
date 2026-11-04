import { describe, expect, it } from 'vitest';
import { wrapCJK } from '../src/render/wrap';

// 每个字符宽度为 1，便于断言
const measure = (s: string) => s.length;

describe('中文换行', () => {
  it('按宽度逐字换行', () => {
    expect(wrapCJK('一二三四五六七', measure, 3)).toEqual(['一二三', '四五六', '七']);
  });

  it('保留原有换行', () => {
    expect(wrapCJK('一二\n三', measure, 5)).toEqual(['一二', '三']);
  });

  it('句末标点不会出现在行首', () => {
    expect(wrapCJK('一二三。四', measure, 3)).toEqual(['一二三。', '四']);
  });

  it('最多挂一个标点，连续标点时前一个字一起换行', () => {
    expect(wrapCJK('一二三……」', measure, 3)).toEqual(['一二', '三……」']);
  });

  it('开引号不会留在行尾', () => {
    expect(wrapCJK('一二“三四”', measure, 3)).toEqual(['一二', '“三四”']);
  });

  it('数字不被拆开', () => {
    expect(wrapCJK('寿元120年', measure, 4)).toEqual(['寿元', '120年']);
  });
});
