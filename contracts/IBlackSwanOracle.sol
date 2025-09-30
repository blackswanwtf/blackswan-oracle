// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IBlackSwanOracle
 * @author Muhammad Bilal Motiwala
 * @notice Interface for interacting with the BlackSwan Oracle smart contract
 * @dev This interface allows smart contracts to read BlackSwan and Market Peak analysis scores
 */
interface IBlackSwanOracle {
    // ============ EVENTS ============

    /**
     * @notice Emitted when BlackSwan score is updated
     * @param newScore The new BlackSwan score (0-100)
     * @param timestamp Block timestamp of the update
     */
    event BlackSwanScoreUpdated(uint256 indexed newScore, uint256 timestamp);

    /**
     * @notice Emitted when Market Peak score is updated
     * @param newScore The new Market Peak score (0-100)
     * @param timestamp Block timestamp of the update
     */
    event MarketPeakScoreUpdated(uint256 indexed newScore, uint256 timestamp);

    /**
     * @notice Emitted when both scores are updated in a single transaction
     * @param newBlackSwanScore The new BlackSwan score (0-100)
     * @param newMarketPeakScore The new Market Peak score (0-100)
     * @param timestamp Block timestamp of the update
     */
    event BothScoresUpdated(
        uint256 indexed newBlackSwanScore,
        uint256 indexed newMarketPeakScore,
        uint256 timestamp
    );

    // ============ READ FUNCTIONS ============

    /**
     * @notice Get the current BlackSwan analysis score
     * @dev Returns the probability score for rare, high-impact market events
     * @return blackSwanScore Current BlackSwan score (0-100)
     *         0 = Very low probability of black swan events
     *         100 = Very high probability of black swan events
     */
    function blackSwanScore() external view returns (uint256);

    /**
     * @notice Get the current Market Peak analysis score
     * @dev Returns the cycle-based analysis score for market peak detection
     * @return marketPeakScore Current Market Peak score (0-100)
     *         0 = Market far from cyclical peak
     *         100 = Market very close to cyclical peak
     */
    function marketPeakScore() external view returns (uint256);

    /**
     * @notice Get both analysis scores in a single call
     * @dev More gas efficient when you need both scores
     * @return blackSwanScore Current BlackSwan score (0-100)
     * @return marketPeakScore Current Market Peak score (0-100)
     */
    function getBothScores()
        external
        view
        returns (uint256 blackSwanScore, uint256 marketPeakScore);

    /**
     * @notice Get the timestamp of the last BlackSwan score update
     * @return timestamp Unix timestamp of last BlackSwan score update
     */
    function lastBlackSwanUpdate() external view returns (uint256);

    /**
     * @notice Get the timestamp of the last Market Peak score update
     * @return timestamp Unix timestamp of last Market Peak score update
     */
    function lastMarketPeakUpdate() external view returns (uint256);

    /**
     * @notice Check if the oracle contract is currently paused
     * @dev When paused, score updates are disabled but reading remains available
     * @return isPaused True if the contract is paused, false otherwise
     */
    function paused() external view returns (bool);
}
