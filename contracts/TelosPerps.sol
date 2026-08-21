// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TelosPerps
 * @dev Mock Perpetual Trading Contract for X Layer hackathon demonstration.
 * Accepts margin in an ERC20 token, and records a leveraged Long or Short position.
 */

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

interface IOKXOracle {
    function getLatestPrice(address asset) external view returns (uint256);
}

contract TelosPerps {
    struct Position {
        address user;
        address asset;      // e.g. WBTC, WETH
        address marginToken;// e.g. USDC
        uint256 marginAmt;  // e.g. 100 USDC
        uint256 leverage;   // e.g. 10 (for 10x)
        bool isLong;        // true = Long, false = Short
        uint256 entryPrice; // Price at which position was opened
        bool isOpen;
    }

    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public userPositions;

    IOKXOracle public oracle;
    address public owner;

    constructor(address _oracle) {
        oracle = IOKXOracle(_oracle);
        owner = msg.sender;
    }

    event PositionOpened(
        uint256 indexed positionId,
        address indexed user,
        address asset,
        address marginToken,
        uint256 marginAmt,
        uint256 leverage,
        bool isLong,
        uint256 entryPrice
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed user,
        uint256 pnl,
        bool isProfit
    );

    function getLatestPrice(address asset) public view returns (uint256) {
        return oracle.getLatestPrice(asset);
    }

    /**
     * @dev Opens a new perpetual position
     */
    function openPosition(
        address _asset,
        address _marginToken,
        uint256 _marginAmt,
        uint256 _leverage,
        bool _isLong
    ) external returns (uint256) {
        require(_marginAmt > 0, "Margin must be > 0");
        require(_leverage >= 1 && _leverage <= 100, "Leverage 1x - 100x");

        // Transfer margin token from user to this contract
        // Note: User must have called approve() on the marginToken first!
        require(
            IERC20(_marginToken).transferFrom(msg.sender, address(this), _marginAmt),
            "Margin transfer failed"
        );

        uint256 currentPrice = getLatestPrice(_asset);

        uint256 positionId = nextPositionId++;

        positions[positionId] = Position({
            user: msg.sender,
            asset: _asset,
            marginToken: _marginToken,
            marginAmt: _marginAmt,
            leverage: _leverage,
            isLong: _isLong,
            entryPrice: currentPrice,
            isOpen: true
        });

        userPositions[msg.sender].push(positionId);

        emit PositionOpened(
            positionId,
            msg.sender,
            _asset,
            _marginToken,
            _marginAmt,
            _leverage,
            _isLong,
            currentPrice
        );

        return positionId;
    }

    /**
     * @dev Closes an existing position and calculates PnL
     */
    function closePosition(uint256 _positionId) external {
        Position storage pos = positions[_positionId];
        require(pos.isOpen, "Position already closed");
        require(pos.user == msg.sender, "Not position owner");

        uint256 currentPrice = getLatestPrice(pos.asset);
        
        uint256 pnl = 0;
        bool isProfit = false;

        // Basic PnL calculation
        if (pos.isLong) {
            if (currentPrice >= pos.entryPrice) {
                isProfit = true;
                pnl = ((currentPrice - pos.entryPrice) * pos.leverage * pos.marginAmt) / pos.entryPrice;
            } else {
                isProfit = false;
                pnl = ((pos.entryPrice - currentPrice) * pos.leverage * pos.marginAmt) / pos.entryPrice;
            }
        } else {
            // Short
            if (currentPrice <= pos.entryPrice) {
                isProfit = true;
                pnl = ((pos.entryPrice - currentPrice) * pos.leverage * pos.marginAmt) / pos.entryPrice;
            } else {
                isProfit = false;
                pnl = ((currentPrice - pos.entryPrice) * pos.leverage * pos.marginAmt) / pos.entryPrice;
            }
        }

        pos.isOpen = false;

        // Determine payout
        uint256 payout = 0;
        if (isProfit) {
            payout = pos.marginAmt + pnl;
        } else {
            if (pnl >= pos.marginAmt) {
                // Liquidated / completely lost margin
                payout = 0;
            } else {
                payout = pos.marginAmt - pnl;
            }
        }

        if (payout > 0) {
            require(
                IERC20(pos.marginToken).transfer(msg.sender, payout),
                "Payout transfer failed"
            );
        }

        emit PositionClosed(_positionId, msg.sender, pnl, isProfit);
    }

    /**
     * @dev Get all position IDs for a user
     */
    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    /**
     * @dev Admin function to withdraw any stuck tokens from the contract
     */
    function adminWithdraw(address token, uint256 amount) external {
        require(msg.sender == owner, "Only owner can withdraw");
        require(
            IERC20(token).transfer(owner, amount),
            "Admin withdrawal failed"
        );
    }
}
