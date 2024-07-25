import { Oracle } from "../generated/schema";
import { Oracle as OracleContract } from "../generated/Morpho/Oracle";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

export function getOrCreateOracle(address: Address, timestamp: BigInt): Oracle {
	let oracle = Oracle.load(address);
	if (oracle == null) {
		oracle = new Oracle(address);

		const oracleContract = OracleContract.bind(address);

		oracle.lastPriceFetchTimestamp = timestamp;
		if (address.equals(Address.zero())) {
			// Zero address is used for idle markets. Here we just not try to fetch the price.
			oracle.save();
			return oracle;
		}
		const tryPrice = oracleContract.try_price();
		if (!tryPrice.reverted) {
			oracle.price = tryPrice.value;
		}
		oracle.save();

		oracle.save();
	}
	return oracle as Oracle;
}

export function updatePrice(address: Bytes, timestamp: BigInt): BigInt | null {
	const oracle = Oracle.load(address);
	if (!oracle) {
		return BigInt.zero();
	}

	const oracleContract = OracleContract.bind(Address.fromBytes(address));

	const tryPrice = oracleContract.try_price();
	if (!tryPrice.reverted) {
		oracle.price = tryPrice.value;
	}
	oracle.lastPriceFetchTimestamp = timestamp;
	oracle.save();

	return oracle.price;
}
