import {SFBoolean, SFDate, SFDecimal, SFInteger, type SFItem, SFString} from "./SFClass.js";

export class Parser {
    readonly #input: string;
    #offset: number = 0;

    constructor(input: string, offset: number = 0) {
        if (/[^\x20-\x7E\t]/.test(this.#input = `${input}`)) throw new SFSyntaxError('Invalid Character Detected');
        this.offset = +offset;
        Object.defineProperty(this, Symbol.toStringTag, {value: new.target.name});
    }

    static parse(input: string) {
        return new this(input).parse();
    }

    /**
     * internal use only
     */
    _parse(options?: {
        expect?: (typeof SFItem) | undefined,
        bareOnly?: boolean,
    }): {
        value: SFItem | null,
        chars: number
    } {
        const bareOnly = Boolean(options?.bareOnly);
        let value = null, chars = Number();
        while (this.#offset < this.#input.length) {
            const char = this.#input.at(this.#offset);
            if (char === undefined) break;
            if (char === '\x20' || char === '\t') {
                this.#offset++;
                continue;
            } else switch (char) {
                case '@':
                    value = SFDate.parse(this.#input, this);
                    break;
                case '?': {
                    const item = this.#input.at(this.#offset + 1)!;
                    if (item === '0' || item === '1') {
                        value = new SFBoolean(item === '1');
                    } else throw new SFSyntaxError('Invalid Boolean Detected');
                    this.#offset += 2;
                    chars += 2;
                    break;
                }
                case '"': {
                    let out = new Array<string>;
                    while (this.#offset < this.#input.length) {
                        const char = this.#input.at(++this.#offset);
                        chars += 1;
                        if (char === undefined) break;
                        if (char === '\\') {
                            if (this.#offset === this.#input.length) throw new SFInterruptEndOfString;
                            const char = this.#input.at(++this.#offset);
                            chars += 1;
                            if (char === undefined) throw new SFInterruptEndOfString;
                            if (char === '\\' || char === '"') out.push(char);
                            throw new SFSyntaxError('only \\ and " can be escaped.');
                        } else if (char === '"') {
                            value = new SFString(out.join(''));
                            // is https://www.rfc-editor.org/info/rfc9651/#section-4.2.5-2.4.2.4.1 needed?
                        } else out.push(char);
                    }
                    break;
                }
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                case '-': {
                    let type: 'integer' | 'decimal' = 'integer', sign = +1,
                        localchar: string = char, result: string[] = Array();
                    if (localchar === '-') {
                        sign = -sign;
                        const localLocalchar = this.#input.at(++this.offset);
                        if (localLocalchar === undefined) throw new SFSyntaxError('Integer is Empty');
                        localchar = localLocalchar;
                        chars += 1;
                    }
                    if (/[^0-9]/.test(localchar)) throw new SFSyntaxError('NonDIGIT Detected');
                    while (true) {
                        chars += 1;
                        const localchar = this.#input.at(this.offset++)!;
                        if (localchar === undefined) break;
                        if (/[0-9]/.test(localchar)) {
                            result.push(localchar);
                        } else if (type === 'integer' && localchar === '.') {
                            if (result.length > 12) throw new SFSyntaxError('Integer Too Long');
                            result.push(localchar);
                            type = 'decimal';
                        } else {
                            this.offset--;
                            chars -= 1;
                            break;
                        }
                        if (type === 'integer' && result.length > 15) throw new SFSyntaxError('Integer Too Long');
                        if (type === 'decimal' && result.length > 16) throw new SFSyntaxError('Decimal Too Long');
                    }
                    if (type === 'integer') value = new SFInteger(BigInt(sign) * BigInt(result.join('')));
                    if (type === 'decimal') {
                        if (result.at(-1) === '.') throw new SFSyntaxError('Decimal MUST NOT end with DOT (.)');
                        value = new SFDecimal(sign * (+result.join('')));
                    }
                    break;
                }
            }

            if (!bareOnly) if (value !== null) this.parseParameterMap(value, chars);
            if (value) {
                const expected = options?.expect;
                if (typeof expected === 'function') {
                    // noinspection SuspiciousTypeOfGuard
                    if (value instanceof expected) {
                        return {value, chars};
                        //break;
                    } else throw new SFTypeError(`Unexpected type, expected ${SFTypeError.getTypeName(value)}`
                        + ` got ${SFTypeError.getTypeName(value!)}`);
                }
            }
        }
        return {value, chars};
    }

    protected parseParameterMap(item: SFItem, chars: number) {
        while (this.#offset < this.#input.length) {
            chars++;
            let char = this.#input.at(this.#offset);
            if (char === undefined) throw new SFInterruptEndOfString('String ended Interruptly');
            if (char !== ';') throw new SFInterruptEndOfString('String ended Interruptly');
            char = this.#input.at(++this.#offset);
            if (char === undefined) throw new SFInterruptEndOfString('String ended Interruptly');
            if (char === '\x20') continue;
            const {key, keychars} = this.parseKey(chars);
            chars += keychars;
            let paramValue: any = new SFBoolean(true);
            char = this.#input.at(--this.#offset);
            if (char === undefined) throw new SFInterruptEndOfString('String ended Interruptly');
            if (char === '=') {
                const newParser = new Parser(this.#input, ++this.#offset), {value, chars} =
                    newParser._parse({bareOnly: true}) as { value: SFItem, chars: number };
                this.offset += chars + 1;
                paramValue = value;
            }
            item.set(key, paramValue);
        }
    }

    protected parseKey(keychars: number) {
        let char = this.#input.at(this.#offset), out = Array();

        if (char === undefined) throw new SFSyntaxError(`empty Key`);
        if (/^[^a-z*]$/.test(char)) throw new SFSyntaxError(`Invalid Key`);
        while (this.#offset < this.#input.length) {
            let char = this.#input.at(this.#offset++);
            if (char === undefined || /^[^a-z*0-9_\-.]$/.test(char))
                return {key: out.join(''), keychars};
            out.push(char);
            keychars++;
        }
        return {key: out.join(''), keychars};
    }

    parse(options?: { expect?: (typeof SFItem) | undefined }): SFItem | null {
        return this._parse(options).value;
    }

    get offset() {
        return this.#offset;
    }

    set offset(value) {
        if (Number.isInteger(value)) this.#offset = value;
        else throw RangeError(value + '\x20is not a valid integer');
    }
}

export class SFSyntaxError extends SyntaxError {
}

export class SFInterruptEndOfString extends SFSyntaxError {
    constructor(message: string = 'String ended Interruptly') {
        super(message);
    }
}

export class SFTypeError extends TypeError {
    static getTypeName(object: object) {
        return Object.prototype.toString.call(object);
    }
}
