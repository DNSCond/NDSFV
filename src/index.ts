//
// export const NDSFV = {
//   parse(structuredString: string): Item[] {
//     const string = `${structuredString}`, array = new Array;
//     for (let line of string.split(/\r?\n/g)) {
//       line = line.trim();
//       if (line.length === 0) continue;
//       array.push(parseUnknownStructuredField(line));
//     } return array;
//   },
//
//   serialize(records: Array<any> | Map<any, any>) {
//     return records.map(record => serializeDictionary(record)).join('\n');
//   }
// };
//
// Object.freeze(NDSFV);
