# Morpho Positions indexer

A POC of an indexer for Morpho borrow positions. That uses a subgraph

It computes the ltv each time a borrower interact with a market.
It also accrues interest on the fly before computing the ltv, with the latest rate fetched during the latest onchain interest accrual. 

## Limitations
There is no way to compute the ltv for each users in order to know which user is liquidatable at one given time.