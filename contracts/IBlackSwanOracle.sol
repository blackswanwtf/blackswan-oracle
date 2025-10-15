// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IBlackSwanOracle
 * @author Muhammad Bilal Motiwala
 * @notice Interface for interacting with the BlackSwan Oracle smart contract
 * @dev This interface allows smart contracts to read BlackSwan and Market Peak analysis scores and IPFS hashes
 */
interface IBlackSwanOracle {
    // ============ EVENTS ============

    /**
     * @notice Emitted when BlackSwan score is updated
     * @param newScore The new BlackSwan score (0-100)
     * @param updatedBy Address that updated the score
     */
    event BlackSwanScoreUpdated(uint256 newScore, address updatedBy);

    /**
     * @notice Emitted when Market Peak score is updated
     * @param newScore The new Market Peak score (0-100)
     * @param updatedBy Address that updated the score
     */
    event MarketPeakScoreUpdated(uint256 newScore, address updatedBy);

    /**
     * @notice Emitted when both scores are updated in a single transaction
     * @param newBlackSwanScore The new BlackSwan score (0-100)
     * @param newMarketPeakScore The new Market Peak score (0-100)
     * @param updatedBy Address that updated the scores
     */
    event BothScoresUpdated(
        uint256 newBlackSwanScore,
        uint256 newMarketPeakScore,
        address updatedBy
    );

    /**
     * @notice Emitted when BlackSwan analysis IPFS hash is updated
     * @param ipfsHash The new IPFS hash
     * @param updatedBy Address that updated the hash
     */
    event BlackSwanAnalysisIPFSUpdated(string ipfsHash, address updatedBy);

    /**
     * @notice Emitted when Market Peak analysis IPFS hash is updated
     * @param ipfsHash The new IPFS hash
     * @param updatedBy Address that updated the hash
     */
    event MarketPeakAnalysisIPFSUpdated(string ipfsHash, address updatedBy);

    /**
     * @notice Emitted when both IPFS hashes are updated in a single transaction
     * @param blackSwanIPFS The new BlackSwan IPFS hash
     * @param marketPeakIPFS The new Market Peak IPFS hash
     * @param updatedBy Address that updated the hashes
     */
    event BothAnalysisIPFSUpdated(
        string blackSwanIPFS,
        string marketPeakIPFS,
        address updatedBy
    );

    /**
     * @notice Emitted when a dev wallet is added
     * @param wallet The wallet address that was added
     */
    event DevWalletAdded(address wallet);

    /**
     * @notice Emitted when a dev wallet is removed
     * @param wallet The wallet address that was removed
     */
    event DevWalletRemoved(address wallet);

    // ============ SCORE READ FUNCTIONS ============

    /**
     * @notice Get the current BlackSwan analysis score
     * @dev Returns the probability score for rare, high-impact market events
     * @return Current BlackSwan score (0-100)
     *         0 = Very low probability of black swan events
     *         100 = Very high probability of black swan events
     */
    function blackSwanScore() external view returns (uint256);

    /**
     * @notice Get the current Market Peak analysis score
     * @dev Returns the cycle-based analysis score for market peak detection
     * @return Current Market Peak score (0-100)
     *         0 = Market far from cyclical peak
     *         100 = Market very close to cyclical peak
     */
    function marketPeakScore() external view returns (uint256);

    /**
     * @notice Get both analysis scores in a single call
     * @dev More gas efficient when you need both scores
     * @return blackSwan Current BlackSwan score (0-100)
     * @return marketPeak Current Market Peak score (0-100)
     */
    function getBothScores()
        external
        view
        returns (uint256 blackSwan, uint256 marketPeak);

    // ============ IPFS READ FUNCTIONS ============

    /**
     * @notice Get the IPFS hash for the latest BlackSwan analysis
     * @return The IPFS hash string
     */
    function blackSwanAnalysisIPFS() external view returns (string memory);

    /**
     * @notice Get the IPFS hash for the latest Market Peak analysis
     * @return The IPFS hash string
     */
    function marketPeakAnalysisIPFS() external view returns (string memory);

    /**
     * @notice Get both IPFS hashes in a single call
     * @dev More gas efficient when you need both hashes
     * @return blackSwanIPFS The BlackSwan analysis IPFS hash
     * @return marketPeakIPFS The Market Peak analysis IPFS hash
     */
    function getBothAnalysisIPFS()
        external
        view
        returns (string memory blackSwanIPFS, string memory marketPeakIPFS);

    /**
     * @notice Get all data (scores and IPFS hashes) in a single call
     * @dev Most gas efficient when you need all oracle data
     * @return blackSwan The current BlackSwan score
     * @return marketPeak The current Market Peak score
     * @return blackSwanIPFS The BlackSwan analysis IPFS hash
     * @return marketPeakIPFS The Market Peak analysis IPFS hash
     */
    function getAllData()
        external
        view
        returns (
            uint256 blackSwan,
            uint256 marketPeak,
            string memory blackSwanIPFS,
            string memory marketPeakIPFS
        );

    // ============ DEV WALLET READ FUNCTIONS ============

    /**
     * @notice Check if an address is a dev wallet
     * @param wallet The address to check
     * @return True if the address is a dev wallet
     */
    function isDevWallet(address wallet) external view returns (bool);

    /**
     * @notice Get the number of dev wallets
     * @return The count of dev wallets
     */
    function getDevWalletCount() external view returns (uint256);

    /**
     * @notice Get dev wallet address by index
     * @param index The index in the dev wallet list
     * @return The wallet address at the given index
     */
    function getDevWalletByIndex(uint256 index) external view returns (address);

    /**
     * @notice Check if a wallet has dev privileges
     * @param wallet The wallet address to check
     * @return True if the wallet has dev privileges
     */
    function devWallets(address wallet) external view returns (bool);

    /**
     * @notice Get dev wallet at a specific index in the list
     * @param index The index in the dev wallet list
     * @return The wallet address at the given index
     */
    function devWalletList(uint256 index) external view returns (address);

    // ============ STATUS FUNCTIONS ============

    /**
     * @notice Check if the oracle contract is currently paused
     * @dev When paused, score updates are disabled but reading remains available
     * @return True if the contract is paused, false otherwise
     */
    function paused() external view returns (bool);
}
