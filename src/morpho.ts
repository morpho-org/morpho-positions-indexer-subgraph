import { BigInt, log } from "@graphprotocol/graph-ts";
import {
	AccrueInterest,
	Borrow,
	CreateMarket,
	Liquidate,
	Repay,
	SupplyCollateral,
	WithdrawCollateral,
} from "../generated/Morpho/Morpho";
import { Market, Position } from "../generated/schema";
import { getOrCreateAsset } from "./assets";
import { getOrCreateOracle } from "./oracles";
import { computeLtv } from "./ltv";

export function handleAccrueInterest(event: AccrueInterest): void {
	// We leverage the fact that intestests are already accrued onchain.
	// so we don't need to fetch the rate and accrue the interest ourselves.
	// This is correct since the interest are accrued before every Morpho operation.
	// If you want to have real time interest, you have to fetch the rate and accrue them on-the-fly.
	// We don't have this problem in a subgraph
	const market = Market.load(event.params.id);
	if (!market) {
		log.critical("Market {} not found", [event.params.id.toString()]);
		return;
	}
	market.lastTotalBorrowAssets = market.lastTotalBorrowAssets.plus(
		event.params.interest,
	);
	market.lastUpdateTimestamp = event.block.timestamp;

	market.lastRate = event.params.prevBorrowRate;
	market.save();
}

export function handleBorrow(event: Borrow): void {
	const market = Market.load(event.params.id);
	if (!market) {
		log.critical("Market {} not found", [event.params.id.toString()]);
		return;
	}

	market.lastTotalBorrowShares = market.lastTotalBorrowShares.plus(
		event.params.shares,
	);
	market.lastTotalBorrowAssets = market.lastTotalBorrowAssets.plus(
		event.params.assets,
	);
	market.save();

	const position = Position.load(event.params.id.concat(event.params.onBehalf));
	if (!position) {
		// It cannot happen since position should have been created at the collateral deposit.
		log.critical("Position {} not found", [
			event.params.id.concat(event.params.onBehalf).toString(),
		]);
		return;
	}
	position.borrowShares = position.borrowShares.plus(event.params.shares);

	// computeLtv(position);
	position.save();
}

export function handleCreateMarket(event: CreateMarket): void {
	let market = new Market(event.params.id);
	market.lltv = event.params.marketParams.lltv;
	market.lastTotalBorrowAssets = BigInt.zero();
	market.lastTotalBorrowAssets = BigInt.zero();
	market.lastRate = BigInt.zero(); // the first interest accrual will set the rate

	market.loanToken = getOrCreateAsset(event.params.marketParams.loanToken).id;
	market.collateralToken = getOrCreateAsset(
		event.params.marketParams.collateralToken,
	).id;

	market.oracle = getOrCreateOracle(
		event.params.marketParams.oracle,
		event.block.timestamp,
	).id;

	market.save();
}

export function handleLiquidate(event: Liquidate): void {
	const market = Market.load(event.params.id);
	if (!market) {
		log.critical("Market {} not found", [event.params.id.toString()]);
		return;
	}
	// The number of borrow shares burn
	const totalBorrowSharesReduced = event.params.repaidShares.plus(
		event.params.badDebtShares,
	);

	market.lastTotalBorrowShares = market.lastTotalBorrowShares.minus(
		totalBorrowSharesReduced,
	);
	market.lastTotalBorrowAssets = market.lastTotalBorrowAssets.minus(
		event.params.repaidAssets,
	);
	market.save();

	const position = Position.load(event.params.id.concat(event.params.borrower));
	if (!position) {
		// It cannot happen since position should have been created at the collateral deposit.
		log.critical("Position {} not found", [
			event.params.id.concat(event.params.borrower).toString(),
		]);
		return;
	}
	position.borrowShares = position.borrowShares.minus(totalBorrowSharesReduced);
	position.collateral = position.collateral.minus(event.params.seizedAssets);

	// computeLtv(position);
	position.save();
}

export function handleRepay(event: Repay): void {
	const market = Market.load(event.params.id);
	if (!market) {
		log.critical("Market {} not found", [event.params.id.toString()]);
		return;
	}

	market.lastTotalBorrowShares = market.lastTotalBorrowShares.minus(
		event.params.shares,
	);
	market.lastTotalBorrowAssets = market.lastTotalBorrowAssets.minus(
		event.params.assets,
	);
	market.save();

	const position = Position.load(event.params.id.concat(event.params.onBehalf));
	if (!position) {
		// It cannot happen since position should have been created at the collateral deposit.
		log.critical("Position {} not found", [
			event.params.id.concat(event.params.onBehalf).toString(),
		]);
		return;
	}
	position.borrowShares = position.borrowShares.minus(event.params.shares);

	// computeLtv(position);
	position.save();
}

export function handleSupplyCollateral(event: SupplyCollateral): void {
	const position = Position.load(event.params.id.concat(event.params.onBehalf));
	if (!position) {
		// It cannot happen since position should have been created at the collateral deposit.
		log.critical("Position {} not found", [
			event.params.id.concat(event.params.onBehalf).toString(),
		]);
		return;
	}
	position.collateral = position.collateral.plus(event.params.assets);
	// computeLtv(position);
	position.save();
}

export function handleWithdrawCollateral(event: WithdrawCollateral): void {
	const position = Position.load(event.params.id.concat(event.params.onBehalf));
	if (!position) {
		// It cannot happen since position should have been created at the collateral deposit.
		log.critical("Position {} not found", [
			event.params.id.concat(event.params.onBehalf).toString(),
		]);
		return;
	}

	position.collateral = position.collateral.minus(event.params.assets);
	computeLtv(position);
	position.save();
}
