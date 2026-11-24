# The Birthday Run: Research

Last updated: 2026-10-06

**Verdict:** no market research. This is a rebuild of a working app for the owner and sisters, with premium for sale later (SPEC §1). The only research needed was on maps, because Google Maps costs money per use.

## Maps and store locations (checked 2026-10-06)
| Question | Finding | Source |
| --- | --- | --- |
| Can Google Places data be stored? | No. Only place IDs may be kept indefinitely; coordinates at most 30 days. Every lookup is a billed call. | [Google Maps Platform service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms/index-20240522) |
| Free map tiles | OpenFreeMap: free public instance, "no limits on the number of map views or requests", no API key, commercial use allowed, MapLibre recommended. Funded by donations, no service guarantee. | [openfreemap.org](https://openfreemap.org/) |
| Chain store locations | All The Places: 20M+ locations from 4,100+ spiders that scrape store locators, updated weekly, CC0, gzipped GeoJSON (ndjson). | [alltheplaces.xyz](https://www.alltheplaces.xyz/) |
| Backup store source | Overture Places: ~81M places (Sept 2026), monthly, has a `brand` field; its docs warn of "duplicates, a high junk rate, and low property completeness"; filter by confidence. Mixed permissive licenses (CC0, Apache-2.0, CDLA-Permissive-2.0). | [Overture places guide](https://docs.overturemaps.org/guides/places) |
| Directions without an API | Google Maps URLs need no API key. Up to 9 waypoints, but only 3 on mobile browsers. | [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) |

## All The Places coverage (measured 2026-10-06)
Method: the 190 retailer names from the Neon backup (#163 in the legacy repo) matched by name against the spider list of ATP run `2026-09-26-13-32-25` (`stats/_results.json`, which gives features per spider). Rough name matching, so treat the numbers as ±5.
- **≈115 of 190 brands (≈60%) have US store data** (a matching spider with stores this run).
- **17 matched spiders returned 0 stores this run** (broken that week, e.g. Olive Garden, Red Robin, Red Lobster, Nordstrom Rack), so one week's output is not reliable on its own.
- **≈4 matched only non-US spiders** (Sephora, CVS, Kiehl's, The Body Shop).
- **≈54 brands have no spider at all.** Some are big chains (Dunkin' US, Cheesecake Factory, Smoothie King, H&M, Urban Outfitters, Anthropologie, Regal); some sell mostly inside other stores or online (Clinique, Estée Lauder, Glossier, Benefit, Too Faced), where "no map pin" is the honest answer.

**Conclusion:** ATP alone isn't enough. Overture Places (which already includes ATP, plus Meta, Foursquare and Microsoft) is needed as the second source, filtered by brand and confidence. The import has to keep the last good result per brand when a source returns 0. Design: DESIGN §1.

## Unknown
- Overture's coverage of the ≈75 brands ATP misses, and its junk rate for them. Measured in the store-import feature's first step.

## Store coverage report (metric 6, BUILD F-9)
First full local run of `npm run import:stores` on 2026-11-24: All The Places run 2026-11-14-13-32-33, Overture release 2026-11-18.0, `OVERTURE_MIN_CONFIDENCE` 0.7. `retailer_stores` size: 37 MB (A-14).

Four ATP spiders returned an empty file this run and count as 0 until they recover: `cracker_barrel_us`, `jersey_mikes_us`, `marcus_theatres`, `olive_garden` (Overture covers Cracker Barrel and Olive Garden). Brands with no stores are mostly beauty brands sold inside other retailers (Clinique, Estée Lauder, Smashbox, tarte, Charlotte Tilbury, Morphe), which is expected; the rest are candidates for tuning the source mapping or the confidence threshold (D9).

| retailer | ATP | Overture | stored | status |
| --- | --- | --- | --- | --- |
| 16-handles | 0 | 0 | 0 | missing |
| alamo-drafthouse | 39 | 1 | 40 | matched |
| alex-and-ani | 0 | 0 | 0 | missing |
| altard-state | 0 | 0 | 0 | missing |
| amc-theatres | 517 | 4 | 521 | matched |
| american-eagle | 660 | 76 | 736 | matched |
| ann-taylor | 223 | 19 | 242 | matched |
| anthropologie | 0 | 213 | 213 | matched |
| auntie-annes | 1403 | 134 | 1537 | matched |
| aveda | 124 | 28 | 152 | matched |
| barnes-and-noble | 742 | 173 | 915 | matched |
| baskin-robbins | 2087 | 75 | 2162 | matched |
| bath-and-body-works | 1846 | 937 | 2783 | matched |
| ben-and-jerrys | 198 | 17 | 215 | matched |
| benihana | 80 | 61 | 141 | matched |
| build-a-bear | 126 | 35 | 161 | matched |
| caribou-coffee | 489 | 14 | 503 | matched |
| charlotte-tilbury | 0 | 0 | 0 | missing |
| cheesecake-factory | 217 | 5 | 222 | matched |
| chick-fil-a | 3463 | 306 | 3769 | matched |
| chilis | 1211 | 15 | 1226 | matched |
| chipotle | 4219 | 438 | 4657 | matched |
| cinnabon | 1188 | 369 | 1557 | matched |
| clinique | 0 | 0 | 0 | missing |
| cold-stone-creamery | 1138 | 199 | 1337 | matched |
| corner-bakery-cafe | 0 | 0 | 0 | missing |
| cracker-barrel | 0 | 12 | 12 | matched |
| crumbl-cookies | 1018 | 278 | 1296 | matched |
| culvers | 1115 | 96 | 1211 | matched |
| cvs | 0 | 57 | 57 | matched |
| dairy-queen | 4177 | 945 | 5122 | matched |
| del-taco | 557 | 3 | 560 | matched |
| dippin-dots | 0 | 0 | 0 | missing |
| dunkin-donuts | 10537 | 897 | 11434 | matched |
| einstein-bros-bagels | 711 | 68 | 779 | matched |
| estee-lauder | 0 | 0 | 0 | missing |
| famous-footwear | 781 | 66 | 847 | matched |
| firehouse-subs | 1295 | 104 | 1399 | matched |
| foot-locker | 624 | 17 | 641 | matched |
| great-american-cookies | 444 | 113 | 557 | matched |
| hollister | 498 | 148 | 646 | matched |
| hot-topic | 576 | 88 | 664 | matched |
| ihop | 1688 | 107 | 1795 | matched |
| jamba-juice | 712 | 41 | 753 | matched |
| jersey-mikes | 0 | 0 | 0 | missing |
| journeys | 0 | 0 | 0 | missing |
| k1-speed | 0 | 0 | 0 | missing |
| kendra-scott | 197 | 83 | 280 | matched |
| krispy-kreme | 344 | 3 | 347 | matched |
| lane-bryant | 362 | 3 | 365 | matched |
| loft | 492 | 33 | 525 | matched |
| macys | 282 | 18 | 300 | matched |
| madewell | 164 | 6 | 170 | matched |
| marble-slab-creamery | 0 | 0 | 0 | missing |
| marcus-theatres | 0 | 0 | 0 | missing |
| menchies | 296 | 55 | 351 | matched |
| moes-southwest-grill | 541 | 22 | 563 | matched |
| morphe | 0 | 0 | 0 | missing |
| noodles-and-company | 383 | 129 | 512 | matched |
| nordstrom-rack | 323 | 42 | 365 | matched |
| nothing-bundt-cakes | 741 | 202 | 943 | matched |
| olive-garden | 0 | 60 | 60 | matched |
| orange-leaf | 0 | 0 | 0 | missing |
| outback-steakhouse | 647 | 5 | 652 | matched |
| p-f-changs | 206 | 36 | 242 | matched |
| panda-express | 2476 | 141 | 2617 | matched |
| pandora | 641 | 63 | 704 | matched |
| panera-bread | 2239 | 72 | 2311 | matched |
| papa-johns | 3065 | 135 | 3200 | matched |
| paris-baguette | 357 | 128 | 485 | matched |
| peets-coffee | 259 | 36 | 295 | matched |
| pinkberry | 62 | 13 | 75 | matched |
| pizza-hut | 5680 | 633 | 6313 | matched |
| popeyes | 3122 | 249 | 3371 | matched |
| qdoba | 879 | 143 | 1022 | matched |
| raising-canes | 1016 | 141 | 1157 | matched |
| red-lobster | 481 | 23 | 504 | matched |
| regal-cinemas | 402 | 203 | 605 | matched |
| ritas-italian-ice | 616 | 538 | 1154 | matched |
| rubios-coastal-grill | 78 | 76 | 154 | matched |
| saks-off-5th | 0 | 0 | 0 | missing |
| sephora | 537 | 13 | 550 | matched |
| shake-shack | 436 | 124 | 560 | matched |
| smashbox | 0 | 0 | 0 | missing |
| smashburger | 153 | 4 | 157 | matched |
| smoothie-king | 1294 | 83 | 1377 | matched |
| starbucks | 16709 | 249 | 16958 | matched |
| studio-movie-grill | 0 | 0 | 0 | missing |
| sugarfish | 0 | 0 | 0 | missing |
| sweet-frog | 205 | 11 | 216 | matched |
| target | 2027 | 29 | 2056 | matched |
| tarte-cosmetics | 0 | 0 | 0 | missing |
| tcby | 118 | 48 | 166 | matched |
| tgi-fridays | 68 | 3 | 71 | matched |
| the-body-shop | 0 | 37 | 37 | matched |
| tim-hortons | 697 | 41 | 738 | matched |
| ulta-beauty | 1557 | 35 | 1592 | matched |
| vera-bradley | 0 | 0 | 0 | missing |
| wingstop | 2733 | 306 | 3039 | matched |
| yogurtland | 215 | 14 | 229 | matched |

≥1 US store: 79 of 100
