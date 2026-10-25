import { describe, expect, it } from 'vitest';
import { validateReadOnlySql } from '../src/services/dataset-providers.js';

describe('MySQL 只读 SQL 白名单', () => {
  it('允许单条 SELECT 与 WITH ... SELECT', () => {
    expect(validateReadOnlySql('SELECT id, name FROM students')).toBe(
      'SELECT id, name FROM students'
    );
    expect(
      validateReadOnlySql('WITH t AS (SELECT 1 AS n) SELECT * FROM t')
    ).toContain('WITH t');
  });

  it('允许分号出现在字符串中，但拒绝多条语句', () => {
    expect(validateReadOnlySql("SELECT 'a;b' AS v")).toBe("SELECT 'a;b' AS v");
    expect(() => validateReadOnlySql('SELECT 1; SELECT 2')).toThrow('单条');
    expect(() => validateReadOnlySql('SELECT 1; DROP TABLE students')).toThrow('单条');
  });

  it('会移除注释，并拒绝可执行注释', () => {
    expect(validateReadOnlySql('SELECT 1 /* comment; */ -- tail')).toBe('SELECT 1');
    expect(validateReadOnlySql('SELECT 1 # tail')).toBe('SELECT 1');
    expect(() => validateReadOnlySql('/*!50000 SELECT 1 */')).toThrow('可执行注释');
  });

  it('拒绝写入、DDL 与文件导出', () => {
    expect(() => validateReadOnlySql('INSERT INTO students VALUES (1)')).toThrow('SELECT');
    expect(() => validateReadOnlySql('UPDATE students SET name = 1')).toThrow('SELECT');
    expect(() => validateReadOnlySql('DELETE FROM students')).toThrow('SELECT');
    expect(() => validateReadOnlySql('WITH t AS (SELECT 1) INSERT INTO x SELECT * FROM t')).toThrow(
      '不允许的关键字'
    );
    expect(() => validateReadOnlySql("SELECT * FROM students INTO OUTFILE '/tmp/a'")).toThrow(
      '不允许的关键字'
    );
    expect(() => validateReadOnlySql('SELECT * FROM students FOR UPDATE')).toThrow('加锁');
  });

  it('拒绝空 SQL 与未闭合引号', () => {
    expect(() => validateReadOnlySql('   ')).toThrow('不能为空');
    expect(() => validateReadOnlySql("SELECT 'abc")).toThrow('引号不完整');
    expect(() => validateReadOnlySql('SELECT 1 /* x')).toThrow('注释不完整');
  });
});
