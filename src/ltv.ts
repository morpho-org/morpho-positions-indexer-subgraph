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

// https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol#L532
export function computeLtv(position: Position): void {
	const ORACLE_PRICE_SCALE = BigInt.fromI32(10 as i32).pow(36 as u8);
	const market = Market.load(position.market)!;

	position.lastUpdateTimestamp = market.lastUpdateTimestamp;
	position.lastBorrowAssets = toAssetsUp(
		position.borrowShares,
		market.lastTotalBorrowAssets,
		market.lastTotalBorrowShares,
	);

	position.lastPriceUsed = updatePrice(
		market.oracle,
		position.lastUpdateTimestamp,
	);
	if (position.lastPriceUsed === null) {
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
