import { Market, Position } from "../generated/schema";
import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { updatePrice } from "./oracles";

// https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/MathLib.sol#L32C14-L32C22
function mulDivUp(x: BigInt, y: BigInt, z: BigInt): BigInt {
	return x
		.times(y)
		.plus(z.minus(BigInt.fromI32(1)))
		.div(z);
}

function mulDivDown(x: BigInt, y: BigInt, z: BigInt): BigInt {
	return x.times(y).div(z);
}

function wMulDown(x: BigInt, y: BigInt): BigInt {
	return x.times(y).div(BigInt.fromI32(1e18 as i32));
}

function wTaylorCompounded(x: BigInt, n: BigInt): BigInt {
	const firstTerm = x.times(n);
	const secondTerm = mulDivDown(
		firstTerm,
		firstTerm,
		BigInt.fromI32(1e18 as i32).times(BigInt.fromI32(2 as i32)),
	);
	const thirdTerm = mulDivDown(
		secondTerm,
		firstTerm,
		BigInt.fromI32(1e18 as i32).times(BigInt.fromI32(3 as i32)),
	);

	return firstTerm.plus(secondTerm).plus(thirdTerm);
}

// https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/SharesMathLib.sol#L41
function toAssetsUp(
	shares: BigInt,
	totalAssets: BigInt,
	totalShares: BigInt,
): BigInt {
	const VIRTUAL_SHARES = BigInt.fromI32(10 as i32).pow(6);
	const VIRTUAL_ASSETS = BigInt.fromI32(1 as i32);

	return mulDivUp(
		shares,
		totalAssets.plus(VIRTUAL_ASSETS),
		totalShares.plus(VIRTUAL_SHARES),
	);
}

const ORACLE_PRICE_SCALE = BigInt.fromI32(10 as i32).pow(36 as u8);

// https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol#L532
export function computeLtv(position: Position, currentTimestamp: BigInt): void {
	const market = Market.load(position.market)!;

	let lastTotalBorrowAssets = market.lastTotalBorrowAssets;
	// Ideally, we fetch the lastRate.
	if (
		currentTimestamp.gt(market.lastUpdateTimestamp) &&
		market.lastRate.gt(BigInt.zero())
	) {
		// We accrue interests on the fly. It can happen because a supply/withdraw of collateral is not triggering an interest accrual.
		// https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol#L483

		const elapsed = currentTimestamp.minus(market.lastUpdateTimestamp);
		const interests = wMulDown(
			lastTotalBorrowAssets,
			wTaylorCompounded(market.lastRate, elapsed),
		);

		lastTotalBorrowAssets = lastTotalBorrowAssets.plus(interests);
	}

	position.lastUpdateTimestamp = market.lastUpdateTimestamp;
	position.lastBorrowAssets = toAssetsUp(
		position.borrowShares,
		lastTotalBorrowAssets,
		market.lastTotalBorrowShares,
	);

	position.lastPriceUsed = updatePrice(
		market.oracle,
		position.lastUpdateTimestamp,
	);
	if (position.lastPriceUsed === null || position.lastBorrowAssets.isZero()) {
		position.lastLtv = BigDecimal.zero();
	} else {
		const maxBorrow = wMulDown(
			mulDivDown(
				position.collateral,
				position.lastPriceUsed!,
				ORACLE_PRICE_SCALE,
			),
			market.lltv,
		);

		if (maxBorrow.isZero())
			position.lastLtv = BigDecimal.fromString("1"); // bad debt position. Can happen with rounding errors on price
		else
			position.lastLtv = position.lastBorrowAssets
				.toBigDecimal()
				.div(maxBorrow.toBigDecimal());
	}

	position.save();
}
