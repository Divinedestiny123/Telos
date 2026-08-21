// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OKXOracle {
    address public owner;
    mapping(address => uint256) public assetPrices;

    event PriceUpdated(address indexed asset, uint256 price);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @dev Updates the price for a specific asset.
     * @param asset The address of the asset (e.g., WBTC).
     * @param price The new price of the asset, scaled to 18 decimals.
     */
    function updatePrice(address asset, uint256 price) external onlyOwner {
        assetPrices[asset] = price;
        emit PriceUpdated(asset, price);
    }

    /**
     * @dev Batch updates prices for multiple assets.
     */
    function updatePrices(address[] calldata assets, uint256[] calldata prices) external onlyOwner {
        require(assets.length == prices.length, "Arrays must have the same length");
        for (uint256 i = 0; i < assets.length; i++) {
            assetPrices[assets[i]] = prices[i];
            emit PriceUpdated(assets[i], prices[i]);
        }
    }

    /**
     * @dev Returns the latest price for an asset.
     */
    function getLatestPrice(address asset) external view returns (uint256) {
        uint256 price = assetPrices[asset];
        require(price > 0, "Price not available for this asset");
        return price;
    }
}
