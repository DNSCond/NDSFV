import {SFDate, SFDictionary} from '../dist/SFClass.js';
import {Parser} from "../dist/SFParse.js";

const date = new SFDate, dict = (new SFDictionary).set('date', date);
date.set('timezone', 'Europe/Amsterdam');
date.set('format', 'Y-m-d\\T:H:i:sp');
dict.set('local', false);
dict.set('global', true);
dict.set('dict', new Uint8Array([75, 117, 90, 46, 244, 192, 128, 139]));
dict.set('bigint', 15n).set('number', 15);

// console.log(dict.sfSerialize());
{
    const parsed = Parser.parse('@1780056780;timezone="America/New_York"');
    parsed.set('random', Math.random() * 2124);
    console.log(JSON.stringify({dict, parsed}, null, 2));
}
