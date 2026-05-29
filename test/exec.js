// random
for (let ownKey of Reflect.ownKeys(Date.prototype).filter(str => str.startsWith?.('to'))) {
    if (ownKey === 'getYear') console.log('getYear() {return this.#dateValue.getFullYear() - 1900;}');
    else console.log(`${ownKey}() {return this.#dateValue.${ownKey}();}`);
}
// ---
// const keys = Reflect.ownKeys(Map.prototype).filter(str => typeof str === 'string').join().replace(/,/g, ', ')
// console.log(keys);
// ---
// for (let ownKey of Reflect.ownKeys(Map.prototype).filter(str => typeof str === 'string')) {
//     console.log(`${ownKey}() {}`);
// }
