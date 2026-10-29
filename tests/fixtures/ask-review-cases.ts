import type { Unit } from '../../server/ask/units'
import type { Extract } from '../../server/ask/excerpts'

export interface ReviewCase {
  id: string; reason: string; units: Unit[]; fields: string[]; linkedUrls: string[]
  quotes: Extract[]; content: string; siteUrl: string
}
// Exact synthetic inputs from the independent review; no production corpus text.
export const reviewCases: ReviewCase[] = [
  {
    "id": "B01",
    "reason": "Edited word pairs still accumulate ordinary evidence.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "Crimson lanterns guide harbor crews safely.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "Crimson lanterns lead harbor crews securely."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"Crimson lanterns lead harbor crews securely.\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B02",
    "reason": "Padding and repetitions cannot reset distinct copied fragments.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "Crimson lanterns guide harbor crews safely.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives. Crimson lanterns lead harbor crews securely after observers independently assess previously unseen alternatives.\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B03",
    "reason": "All uncited components share the six-hit counter.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "note",
        "title": "",
        "text": "Our interpretation.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      },
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000002",
        "kind": "post",
        "title": "",
        "text": "Sapphire glows while moonstone rests.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000002"
      }
    ],
    "fields": [
      "",
      "",
      "Sapphire flares as moonstone sleeps."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"Sapphire flares as moonstone sleeps.\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B04",
    "reason": "Partial same-source matches retain quote bonus.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "Crimson lanterns guide harbor crews safely. A beacon burns.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "Crimson lanterns glow beside checkpoints."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [
      {
        "text": "A beacon burns.",
        "url": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"Crimson lanterns glow beside checkpoints.\",\"sources\":[\"S1\"],\"quote\":{\"chunk_id\":\"S1\",\"start\":44,\"end\":59}}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B05",
    "reason": "Overlapping hashes do not merge copied positions away.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "bcdefghijqqbcdefghjkqqbcdefghklqqbcdefghlm",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "bcdefghij independent analysis bcdefghjk independent analysis bcdefghkl independent analysis bcdefghlm"
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"bcdefghij independent analysis bcdefghjk independent analysis bcdefghkl independent analysis bcdefghlm\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B06",
    "reason": "Title and body share one cumulative evidence stream.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "Crimson lanterns guide harbor crews safely.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "Crimson",
      " lanterns lead harbor ",
      "crews securely."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"Crimson\",\"points\":[{\"title\":\" lanterns lead harbor \",\"text\":\"crews securely.\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B07",
    "reason": "Zero-width characters do not hide copied evidence.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "Crimson lanterns guide harbor crews safely.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "​C​r​i​m​s​o​n​ ​l​a​n​t​e​r​n​s​ ​l​e​a​d​ ​h​a​r​b​o​r​ ​c​r​e​w​s​ ​s​e​c​u​r​e​l​y​.​"
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"​C​r​i​m​s​o​n​ ​l​a​n​t​e​r​n​s​ ​l​e​a​d​ ​h​a​r​b​o​r​ ​c​r​e​w​s​ ​s​e​c​u​r​e​l​y​.​\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B08",
    "reason": "Compatibility normalization preserves copy evidence.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "Crimson lanterns guide harbor crews safely.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "Ｃｒｉｍｓｏｎ ｌａｎｔｅｒｎｓ ｌｅａｄ ｈａｒｂｏｒ ｃｒｅｗｓ ｓｅｃｕｒｅｌｙ."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"Ｃｒｉｍｓｏｎ ｌａｎｔｅｒｎｓ ｌｅａｄ ｈａｒｂｏｒ ｃｒｅｗｓ ｓｅｃｕｒｅｌｙ.\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B09",
    "reason": "Han separators do not hide Latin copied pairs.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "Crimson lanterns guide harbor crews safely.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "以Crimson lanterns引导harbor crews行动。"
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"以Crimson lanterns引导harbor crews行动。\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B10",
    "reason": "Same-original anchor URL variants share evidence.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "method",
        "title": "",
        "text": "Our explanation.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001",
        "quotes": [
          {
            "text": "Crimson lanterns guide harbor crews safely.",
            "url": "https://x.com/mattpocockuk/status/1000000000000000001?a=1#x"
          },
          {
            "text": "Crimson lanterns guide harbor crews safely.",
            "url": "https://x.com/mattpocockuk/status/1000000000000000001/?a=2#y"
          }
        ]
      }
    ],
    "fields": [
      "",
      "",
      "Crimson lanterns lead harbor crews securely."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"Crimson lanterns lead harbor crews securely.\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B11",
    "reason": "Interleaving independent words cannot erase short-word counts.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "an an an an an an an an an an an an an an an an an an an an an an an an an an",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently"
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B12",
    "reason": "Different interleaved tiny words share the word budget.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "We go up to it as we do so by an ox at an inn or by my ax if it is on us we go.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "We separately go separately up separately to separately it separately as separately we separately do separately so separately by separately an separately ox separately at separately an separately inn separately or separately by separately my separately ax separately if separately it separately is separately on separately us separately we separately go."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"We separately go separately up separately to separately it separately as separately we separately do separately so separately by separately an separately ox separately at separately an separately inn separately or separately by separately my separately ax separately if separately it separately is separately on separately us separately we separately go.\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B13",
    "reason": "A partial long source word is never a complete-term exception.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "abcdefghijklmnopqrstuvwxyza",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options"
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options abcdefghijklmnopqrs independently evaluates unusual options\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B14",
    "reason": "Hyphens and spaces retain the same baseline evidence.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "Amber-birds-gather-beneath-tall-elms.",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "Amber birds gather versus unrelated alternatives then beneath tall zelkova."
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"Amber birds gather versus unrelated alternatives then beneath tall zelkova.\",\"sources\":[\"S1\"]}]}",
    "siteUrl": "https://site.example"
  },
  {
    "id": "B15",
    "reason": "Quotes and scattered short words share one budget.",
    "units": [
      {
        "id": "https://x.com/mattpocockuk/status/1000000000000000001",
        "kind": "post",
        "title": "",
        "text": "An amber beacon. an an an an an an an an an an an an an an an an an an an an an an an an an an",
        "sourceUrl": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "fields": [
      "",
      "",
      "an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently"
    ],
    "linkedUrls": [
      "https://x.com/mattpocockuk/status/1000000000000000001"
    ],
    "quotes": [
      {
        "text": "An amber beacon.",
        "url": "https://x.com/mattpocockuk/status/1000000000000000001"
      }
    ],
    "content": "{\"found\":true,\"title\":\"\",\"points\":[{\"title\":\"\",\"text\":\"an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently an independently\",\"sources\":[\"S1\"],\"quote\":{\"chunk_id\":\"S1\",\"start\":0,\"end\":16}}]}",
    "siteUrl": "https://site.example"
  }
]
