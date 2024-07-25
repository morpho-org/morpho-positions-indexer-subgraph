import { Asset } from "../generated/schema";
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { ERC20 } from "../generated/Morpho/ERC20";

const MKR = Address.fromString("0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2");

export function getOrCreateAsset(address: Address): Asset {
	let asset = Asset.load(address);
	if (asset == null) {
		asset = new Asset(address);

		const erc20Contract = ERC20.bind(address);
		let result = erc20Contract.try_symbol();
		if (!result.reverted) {
			asset.symbol = result.value;
		} else {
			if (address.equals(MKR)) {
				// MKR is a special case where the symbol is not a string, but a bytes32
				// https://etherscan.io/address/0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2#readContract#F7
				asset.symbol = "MKR";
			}
			asset.symbol = "UNKNOWN"; // Symbol is optional in eip20 description
		}
		const decimalsResult = erc20Contract.try_decimals();
		if (!decimalsResult.reverted) {
			asset.decimals = BigInt.fromI32(decimalsResult.value);
		} else {
			asset.decimals = BigInt.fromI32(18 as i32); // Decimals is optional in eip20 description
		}

		asset.save();
	}
	return asset;
}
