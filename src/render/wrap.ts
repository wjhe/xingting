/** 不能出现在行首的标点：放不下时允许挂在上一行末尾 */
const NO_LINE_START = new Set('，。！？、；：”’）》」』】…—,.!?;:)%');
/** 不能出现在行尾的标点：会被挪到下一行开头 */
const NO_LINE_END = new Set('“‘（《「『【(');

/** 连续的字母数字作为一个整体，避免"120"被拆成两行 */
const TOKEN_RE = /[A-Za-z0-9+\-.%×]+|[\s\S]/g;

/**
 * 中文逐字换行。Phaser 自带的换行按空格分词，对中文无效。
 * @param measure 返回字符串渲染宽度
 */
export function wrapCJK(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const tokens = para.match(TOKEN_RE) ?? [];
    let line = '';
    for (const tok of tokens) {
      const candidate = line + tok;
      if (line === '' || measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (NO_LINE_START.has(tok)) {
        // 允许一个标点挂在行尾；已经挂过的话，把前一个字连同标点一起移到下一行
        let i = line.length - 1;
        while (i > 0 && NO_LINE_START.has(line[i])) i--;
        if (i === line.length - 1 || i === 0) {
          line = candidate;
        } else {
          out.push(line.slice(0, i));
          line = line.slice(i) + tok;
        }
        continue;
      }
      // 行尾是开引号之类的，把它带到下一行
      let carry = '';
      while (line.length > 1 && NO_LINE_END.has(line[line.length - 1])) {
        carry = line[line.length - 1] + carry;
        line = line.slice(0, -1);
      }
      out.push(line);
      line = carry + tok;
    }
    out.push(line);
  }
  return out;
}
