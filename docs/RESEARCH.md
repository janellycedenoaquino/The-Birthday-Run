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
