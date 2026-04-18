declare module 'typo-js' {
  class Typo {
    constructor(dictionary: string, affData?: string, dicData?: string);
    check(word: string): boolean;
    suggest(word: string): string[];
  }
  export = Typo;
}
