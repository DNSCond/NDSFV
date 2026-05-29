// SFClass

export type ParameterMap = Map<string, SFObject>;
export type SFObject =
    | SFString
    | SFToken
    | SFDisplayString
    | SFInteger
    | SFDecimal
    | SFDate
    | SFBoolean
    | SFByteSequence
    | SFDictionary
    | SFList;

export abstract class SFItem extends Map<string, SFObject> {
    protected constructor(...rest: any[]) {
        super(...rest);
        Object.defineProperty(this, Symbol.toStringTag, {value: new.target.name});
    }

    set(key: string, value: SFObject | boolean | number | string | bigint): this {
        return super.set(this.validateKey(key), toSFWrapperValue(value, true, true));
    }

    // Helper to serialize parameters across all child classes
    serializeParams(isParam: boolean): string {
        if (isParam) return '';
        let result = '';
        for (const [key, value] of this) {
            result += ';' + this.validateKey(key);
            if (value instanceof SFBoolean) if (value.valueOf()) continue;
            const serialized = value.sfSerialize?.({isParam: true});
            if (serialized === undefined) throw TypeError('couldnt serialize' + String(value));
            result += `=${serialized}`;
        }
        return result;
    }

    validateKey(key: string) {
        const SF_KEY_RE = /^[a-z0-9_\-.*]+$/;
        if (!SF_KEY_RE.test(key)) throw SyntaxError('serializeParams key MUST contain valid characters');
        if (!+/^[a-z]/.test(key)) throw SyntaxError('serializeParams key MUST start with a lowercase alpha');
        return key;
    }

    abstract sfSerialize(options?: paramOptions): string
}

type paramOptions = { inner?: boolean, isParam?: boolean };

function resolveSFSerialize(options?: paramOptions) {
    return {isParam: Boolean(options?.isParam), inner: Boolean(options?.inner)};
}

export class SFString extends SFItem {
    readonly #stringValue;

    constructor(stringValue: string) {
        super();
        stringValue = `${stringValue}`;
        if (INVALID_ASCII_RE.test(stringValue)) {
            throw RangeError('SFString contains characters outside the allowed ASCII range (0x20-0x7E)');
        }
        this.#stringValue = stringValue;
    }

    toString() {
        return this.#stringValue;
    }

    valueOf() {
        return this.#stringValue;
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        return '"' + this.#stringValue.replaceAll(/\\/g, '\\\\').replaceAll(/"/g, '\\"') + '"' + this.serializeParams(isParam);
    }
}

const INVALID_ASCII_RE = /[^\x20-\x7E]/,
    SF_TOKEN_RE = /^[A-Za-z*][\x21\x23-\x27\x2A\x2B\x2D\x2E\x30-\x39\x41-\x5A\x5E-\x7A\x7C\x7E:\/]*$/;

export class SFToken extends SFItem {
    readonly #tokenValue;

    constructor(tokenValue: string) {
        super();
        tokenValue = `${tokenValue}`;
        if (typeof (tokenValue as any) !== 'string')
            throw TypeError('SFToken expects a string');
        if (!SF_TOKEN_RE.test(tokenValue))
            throw SyntaxError('SFToken contains characters outside the allowed ASCII range (0x20-0x7E)');
        this.#tokenValue = tokenValue;
    }

    toString() {
        return this.#tokenValue;
    }

    valueOf() {
        return this.#tokenValue;
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        return this.#tokenValue + this.serializeParams(isParam);
    }
}

export class SFDisplayString extends SFItem {
    readonly #stringValue;

    constructor(stringValue: string) {
        super();
        if (typeof (stringValue as any) !== 'string')
            throw TypeError('SFString expects a string');
        this.#stringValue = stringValue;
    }

    toString() {
        return this.#stringValue;
    }

    valueOf() {
        return this.#stringValue;
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        let encoded = '%"';
        const decoder = new TextDecoder;
        for (const byte of (new TextEncoder).encode(this.#stringValue)) {
            if (byte === 0x25 || byte === 0x22 || byte < 0x1f || byte > 0x7E) {
                encoded += '%' + byte.toString(16).toUpperCase();
            } else {
                encoded += decoder.decode(Uint8Array.of(byte));
            }
        }
        return encoded + '"' + this.serializeParams(isParam);
    }
}

export class SFInteger extends SFItem {
    readonly #intValue;

    constructor(int: bigint | number = 0n) {
        super();
        this.#intValue = BigInt(int);
        if (this.#intValue < -999_999_999_999_999n || this.#intValue > 999_999_999_999_999n)
            throw RangeError('Structured Fields does not support that mathematical BigInt');
    }

    toString() {
        return `${this.#intValue}`;
    }

    valueOf(): bigint {
        return this.#intValue;
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        return `${this.#intValue}${this.serializeParams(isParam)}`;
    }

    asUintN(bits: number) {
        return new (this.constructor as typeof SFInteger)(BigInt.asUintN(bits, this.#intValue));
    };

    asIntN(bits: number) {
        return new (this.constructor as typeof SFInteger)(BigInt.asIntN(bits, this.#intValue));
    };
}

export class SFDecimal extends SFItem {
    readonly #numberValue;

    constructor(int: number) {
        super();
        this.#numberValue = Number(int);
        if (!Number.isFinite(this.#numberValue)) {
            throw TypeError('Invalid Decimal number');
        }

        // Split to validate exact integer component ceiling
        const absValue = Math.abs(this.#numberValue);
        const integerPart = Math.floor(absValue).toString();
        if (integerPart.length > 12) {
            throw RangeError('Structured Fields Decimals cannot exceed 12 integer digits');
        }
    }

    toString() {
        return `${this.#numberValue}`;
    }

    valueOf() {
        return this.#numberValue;
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        // Round to max 3 decimal places
        let numStr = (Math.round(this.#numberValue * 1000) / 1000).toString();

        // Ensure scientific notation doesn't leak out from V8 stringification
        if (numStr.includes('e')) {
            numStr = this.#numberValue.toFixed(3).replace(/\.?0+$/, '');
        }

        // Add structural .0 fallback if stringified back into an implicit integer
        if (!numStr.includes('.')) {
            numStr += '.0';
        }
        return numStr + this.serializeParams(isParam);
    }
}

//Reflect.ownKeys(Date.prototype).filter(str=>str.startsWith?.('get')).join().replace(/,/g,', ')
export class SFDate extends SFItem {
    readonly #dateValue;

    constructor(date?: Date | string | number) {
        super();
        (this.#dateValue = new Date(date ?? Date.now())).setUTCMilliseconds(0);
        // NaN dates throw a RangeError
        this.#dateValue.toISOString();
    }

    toString() {
        return this.#dateValue.toISOString();
    }

    toISOString() {
        return this.#dateValue.toISOString();
    }

    valueOf() {
        return this.#dateValue.valueOf();
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        return ('@' + this.#dateValue.setUTCMilliseconds(0) / 1000) + this.serializeParams(isParam);
    }

    [Symbol.toPrimitive](hint: string) {
        return Reflect.apply(Date.prototype[Symbol.toPrimitive], this, [hint]);
    }

    toJSON() {
        // noinspection JSPrimitiveTypeWrapperUsage
        return Reflect.apply(Date.prototype.toJSON, this, new Array);
    }

    static fromSeconds(seconds: number) {
        return new this(Math.floor(seconds) * 1000);
    }

    toUTCString() {
        return this.#dateValue.toUTCString();
    }

    toClassicString() {
        return this.#dateValue.toString();
    }

    toDate() {
        return Reflect.construct(Date, [this.#dateValue]);
    }

    // date proxy.
    getDate() {
        return this.#dateValue.getDate();
    }

    getDay() {
        return this.#dateValue.getDay();
    }

    getFullYear() {
        return this.#dateValue.getFullYear();
    }

    getHours() {
        return this.#dateValue.getHours();
    }

    getMilliseconds() {
        return this.#dateValue.getMilliseconds();
    }

    getMinutes() {
        return this.#dateValue.getMinutes();
    }

    getMonth() {
        return this.#dateValue.getMonth();
    }

    getSeconds() {
        return this.#dateValue.getSeconds();
    }

    getTime() {
        return this.#dateValue.getTime();
    }

    getTimezoneOffset() {
        return this.#dateValue.getTimezoneOffset();
    }

    getUTCDate() {
        return this.#dateValue.getUTCDate();
    }

    getUTCDay() {
        return this.#dateValue.getUTCDay();
    }

    getUTCFullYear() {
        return this.#dateValue.getUTCFullYear();
    }

    getUTCHours() {
        return this.#dateValue.getUTCHours();
    }

    getUTCMilliseconds() {
        return this.#dateValue.getUTCMilliseconds();
    }

    getUTCMinutes() {
        return this.#dateValue.getUTCMinutes();
    }

    getUTCMonth() {
        return this.#dateValue.getUTCMonth();
    }

    getUTCSeconds() {
        return this.#dateValue.getUTCSeconds();
    }

    getYear() {
        return this.#dateValue.getFullYear() - 1900;
    }
}

export class SFBoolean extends SFItem {
    readonly #booleanValue;

    constructor(boolean: boolean) {
        super();
        this.#booleanValue = Boolean(boolean);
    }

    toString() {
        return this.#booleanValue.toString();
    }

    valueOf() {
        return this.#booleanValue;
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        return "?" + String(Number(Boolean(this.#booleanValue))) + this.serializeParams(isParam);
    }
}

export class SFByteSequence extends SFItem {
    #bytes;

    constructor(byteSequence: ArrayBufferView<ArrayBufferLike>) {
        super();
        // ArrayBuffer.isView() instantly identifies any TypedArray or DataView
        if (ArrayBuffer.isView(byteSequence)) {
            // Safely extract the exact byte window, respecting offsets and lengths!
            this.#bytes = new Uint8Array(
                byteSequence.buffer,
                byteSequence.byteOffset,
                byteSequence.byteLength,
            );
        } else {
            throw TypeError("SFByteSequence expects an ArrayBuffer, TypedArray, or DataView.");
        }
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        // @ts-ignore
        return ':' + (this.#bytes).toBase64() + ':' + this.serializeParams(isParam);
    }
}


export class SFList extends Array {
    #mapData: ParameterMap = new Map;
    [Symbol.toStringTag] = 'SFList';

    get(key: string): SFObject | undefined {
        return this.#mapData.get(key);
    }

    set(key: string, value: SFObject): ParameterMap {
        return this.#mapData.set(SFItem.prototype.validateKey(key), toSFWrapperValue(value, false, true));
    }

    has(key: string): boolean {
        return this.#mapData.has(key);
    }

    delete(key: string): boolean {
        return this.#mapData.delete(key);
    }

    clear(): void {
        return this.#mapData.clear();
    }

    entries(): MapIterator<[any, any]> {
        return this.#mapData.entries();
    }

    param_forEach(callbackfn: (value: SFObject, key: string, map: Map<string, SFObject>) => void, thisArg?: any) {
        return this.#mapData.forEach(callbackfn, thisArg);
    }

    param_keys(): MapIterator<string> {
        return this.#mapData.keys();
    }

    size(): number {
        return this.#mapData.size;
    }

    param_values(): MapIterator<SFObject> {
        return this.#mapData.values();
    }

    validate(strict = true) {
        for (const [value, index] of enumerate(this)) {
            if (isSFWrapper(value)) continue;
            if (!strict) this[index] = toSFWrapperValue(value, false, true);
            throw TypeError(`index ${index} is not one of the valid types.`);
        }
        return this;
    }

    sfSerialize(options?: paramOptions) {
        const {inner, isParam} = resolveSFSerialize(options);
        let output = String();
        for (const sfValue of this.validate(false)) {
            if (inner) output += sfValue.sfSerialize({isParam}) + '\x20';
            else output += sfValue.sfSerialize({isParam}) + ',\x20';
        }
        return (inner ? '(' : '') + output.replace(/,?\x20$/, '')
            + (inner ? ')' + Reflect.apply(SFItem.prototype.serializeParams, this.#mapData, [isParam]) : '');
    }
}

Object.defineProperty(SFList.prototype, Symbol.toStringTag, {value: 'SFList'});

export class SFDictionary extends Map<string, SFObject> {
    constructor(entries?: MapIterator<[string, SFObject]>) {
        super(entries);
        Object.defineProperty(this, Symbol.toStringTag, {value: new.target.name});
    }

    set(key: string, value: SFObject | boolean | number | string | bigint): this {
        return super.set(SFItem.prototype.validateKey(key), toSFWrapperValue(value, false, true));
    }

    validate(strict = true) {
        for (const [[key, value], index] of enumerate(this)) {
            const isWrapper = isSFWrapper(value);
            SFItem.prototype.validateKey(key);
            if (isWrapper && key) continue;
            const error = TypeError(`index ${index} is not one of the valid types.`)
            // invalid value
            if (strict) throw error;
            this.set(key, value);
            if (isSFWrapper(this.get(key))) continue;
            throw Error('unknown SFDictionary.prototype.validate');
        }
        return this;
    }

    sfSerialize(options?: paramOptions) {
        const {isParam} = resolveSFSerialize(options);
        let output = String();
        for (const [key, element] of this.validate(false)) {
            let out = key;
            if (element instanceof SFBoolean && element.valueOf() === true) {
                out += element.sfSerialize({inner: true, isParam}).slice(2);
            } else if (element instanceof SFList) {
                out += '=' + element.sfSerialize({inner: true, isParam});
            } else {
                out += '=' + element.sfSerialize({inner: true, isParam});
            }
            output += `${out},\x20`;
        }
        return output.replace(/,?\x20$/, '');
    }
}

export function isSFWrapper(value: any) {
    if (value instanceof SFString) return true;
    if (value instanceof SFToken) return true;
    if (value instanceof SFDisplayString) return true;
    if (value instanceof SFInteger) return true;
    if (value instanceof SFDecimal) return true;
    if (value instanceof SFDate) return true;
    if (value instanceof SFBoolean) return true;
    if (value instanceof SFByteSequence) return true;
    if (value instanceof SFDictionary) return true;
    if (value instanceof SFList) return true;
    // otherwise
    return false;

}

export function* enumerate<T>(iterator: Iterable<T>): Generator<[T, number], void, unknown> {
    let index = 0;
    for (const value of iterator) yield [value, index++];
}

export function toSFWrapperValue(value: any, itemOnly: boolean = false, strict = false) {
    if (value instanceof String || typeof value === 'string') {
        return new SFString(value as string);
    } else if (value instanceof Number || typeof value === 'number') {
        return new SFDecimal(value as number);
    } else if (value instanceof Boolean || typeof value === 'boolean') {
        return new SFBoolean(value.valueOf());
    } else if (value instanceof Date) {
        return new SFDate(value);
    } else if (value instanceof Uint8Array) {
        return new SFByteSequence(value);
    } else if (typeof value === 'bigint') {
        return new SFInteger(value);
    }
    if (!itemOnly) if (Array.isArray(value)) {
        return Reflect.construct(SFList, value);
    } else if (value instanceof Map && !isSFWrapper(value)) {
        return new SFDictionary(value.entries());
    }
    if (isSFWrapper(value)) return value;
    if (strict) throw TypeError('toSFWrapperValue\'s value cannot be matched an it is called strictly.');
    return null;
}
