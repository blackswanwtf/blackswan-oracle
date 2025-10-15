// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title BlackSwan Oracle Contract
/// @notice UUPS upgradable oracle contract for managing Black Swan and Market Peak analysis scores
/// @dev Inherits from UUPSUpgradeable, OwnableUpgradeable, and PausableUpgradeable
contract BlackSwanOracle is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable
{
    /// @notice The Black Swan Analysis Score
    uint256 public blackSwanScore;

    /// @notice The Market Peak Analysis Score
    uint256 public marketPeakScore;

    /// @notice IPFS hash for the latest Black Swan analysis JSON
    string public blackSwanAnalysisIPFS;

    /// @notice IPFS hash for the latest Market Peak analysis JSON
    string public marketPeakAnalysisIPFS;

    /// @notice Mapping of dev wallet addresses that can update scores
    mapping(address => bool) public devWallets;

    /// @notice Array of dev wallet addresses for enumeration
    address[] public devWalletList;

    // Events
    event BlackSwanScoreUpdated(uint256 newScore, address updatedBy);
    event MarketPeakScoreUpdated(uint256 newScore, address updatedBy);
    event BothScoresUpdated(
        uint256 newBlackSwanScore,
        uint256 newMarketPeakScore,
        address updatedBy
    );
    event BlackSwanAnalysisIPFSUpdated(string ipfsHash, address updatedBy);
    event MarketPeakAnalysisIPFSUpdated(string ipfsHash, address updatedBy);
    event BothAnalysisIPFSUpdated(
        string blackSwanIPFS,
        string marketPeakIPFS,
        address updatedBy
    );
    event DevWalletAdded(address wallet);
    event DevWalletRemoved(address wallet);

    /// @notice Modifier to restrict function access to owner or dev wallets
    modifier onlyOwnerOrDev() {
        require(
            msg.sender == owner() || devWallets[msg.sender],
            "BlackSwanOracle: caller is not owner or dev wallet"
        );
        _;
    }

    /// @notice Initialize the contract (replaces constructor for upgradeable contracts)
    /// @param initialOwner Address that will be set as the contract owner
    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __Pausable_init();
        __UUPSUpgradeable_init();

        // Initialize scores to 0
        blackSwanScore = 0;
        marketPeakScore = 0;
    }

    /// @notice Update the Black Swan Analysis Score
    /// @param newScore The new Black Swan score
    function updateBlackSwanScore(
        uint256 newScore
    ) external onlyOwnerOrDev whenNotPaused {
        blackSwanScore = newScore;
        emit BlackSwanScoreUpdated(newScore, msg.sender);
    }

    /// @notice Update the Market Peak Analysis Score
    /// @param newScore The new Market Peak score
    function updateMarketPeakScore(
        uint256 newScore
    ) external onlyOwnerOrDev whenNotPaused {
        marketPeakScore = newScore;
        emit MarketPeakScoreUpdated(newScore, msg.sender);
    }

    /// @notice Update both scores in a single transaction
    /// @param newBlackSwanScore The new Black Swan score
    /// @param newMarketPeakScore The new Market Peak score
    function updateBothScores(
        uint256 newBlackSwanScore,
        uint256 newMarketPeakScore
    ) external onlyOwnerOrDev whenNotPaused {
        blackSwanScore = newBlackSwanScore;
        marketPeakScore = newMarketPeakScore;
        emit BothScoresUpdated(
            newBlackSwanScore,
            newMarketPeakScore,
            msg.sender
        );
    }

    /// @notice Add a dev wallet that can update scores
    /// @param wallet The wallet address to add
    function addDevWallet(address wallet) external onlyOwner {
        require(
            wallet != address(0),
            "BlackSwanOracle: wallet cannot be zero address"
        );
        require(!devWallets[wallet], "BlackSwanOracle: wallet already added");

        devWallets[wallet] = true;
        devWalletList.push(wallet);
        emit DevWalletAdded(wallet);
    }

    /// @notice Remove a dev wallet
    /// @param wallet The wallet address to remove
    function removeDevWallet(address wallet) external onlyOwner {
        require(devWallets[wallet], "BlackSwanOracle: wallet not found");

        devWallets[wallet] = false;

        // Remove from array
        for (uint256 i = 0; i < devWalletList.length; i++) {
            if (devWalletList[i] == wallet) {
                devWalletList[i] = devWalletList[devWalletList.length - 1];
                devWalletList.pop();
                break;
            }
        }

        emit DevWalletRemoved(wallet);
    }

    /// @notice Get the number of dev wallets
    /// @return The count of dev wallets
    function getDevWalletCount() external view returns (uint256) {
        return devWalletList.length;
    }

    /// @notice Get dev wallet address by index
    /// @param index The index in the dev wallet list
    /// @return The wallet address at the given index
    function getDevWalletByIndex(
        uint256 index
    ) external view returns (address) {
        require(
            index < devWalletList.length,
            "BlackSwanOracle: index out of bounds"
        );
        return devWalletList[index];
    }

    /// @notice Check if an address is a dev wallet
    /// @param wallet The address to check
    /// @return True if the address is a dev wallet
    function isDevWallet(address wallet) external view returns (bool) {
        return devWallets[wallet];
    }

    /// @notice Get both scores in a single call
    /// @return blackSwan The current Black Swan score
    /// @return marketPeak The current Market Peak score
    function getBothScores()
        external
        view
        returns (uint256 blackSwan, uint256 marketPeak)
    {
        return (blackSwanScore, marketPeakScore);
    }

    /// @notice Update the Black Swan Analysis IPFS hash
    /// @param ipfsHash The IPFS hash of the analysis JSON
    function updateBlackSwanAnalysisIPFS(
        string memory ipfsHash
    ) external onlyOwnerOrDev whenNotPaused {
        blackSwanAnalysisIPFS = ipfsHash;
        emit BlackSwanAnalysisIPFSUpdated(ipfsHash, msg.sender);
    }

    /// @notice Update the Market Peak Analysis IPFS hash
    /// @param ipfsHash The IPFS hash of the analysis JSON
    function updateMarketPeakAnalysisIPFS(
        string memory ipfsHash
    ) external onlyOwnerOrDev whenNotPaused {
        marketPeakAnalysisIPFS = ipfsHash;
        emit MarketPeakAnalysisIPFSUpdated(ipfsHash, msg.sender);
    }

    /// @notice Update both IPFS hashes in a single transaction
    /// @param blackSwanIPFS The IPFS hash for Black Swan analysis
    /// @param marketPeakIPFS The IPFS hash for Market Peak analysis
    function updateBothAnalysisIPFS(
        string memory blackSwanIPFS,
        string memory marketPeakIPFS
    ) external onlyOwnerOrDev whenNotPaused {
        blackSwanAnalysisIPFS = blackSwanIPFS;
        marketPeakAnalysisIPFS = marketPeakIPFS;
        emit BothAnalysisIPFSUpdated(blackSwanIPFS, marketPeakIPFS, msg.sender);
    }

    /// @notice Update scores and IPFS hashes together
    /// @param newBlackSwanScore The new Black Swan score
    /// @param newMarketPeakScore The new Market Peak score
    /// @param blackSwanIPFS The IPFS hash for Black Swan analysis
    /// @param marketPeakIPFS The IPFS hash for Market Peak analysis
    function updateScoresAndAnalysis(
        uint256 newBlackSwanScore,
        uint256 newMarketPeakScore,
        string memory blackSwanIPFS,
        string memory marketPeakIPFS
    ) external onlyOwnerOrDev whenNotPaused {
        blackSwanScore = newBlackSwanScore;
        marketPeakScore = newMarketPeakScore;
        blackSwanAnalysisIPFS = blackSwanIPFS;
        marketPeakAnalysisIPFS = marketPeakIPFS;
        emit BothScoresUpdated(
            newBlackSwanScore,
            newMarketPeakScore,
            msg.sender
        );
        emit BothAnalysisIPFSUpdated(blackSwanIPFS, marketPeakIPFS, msg.sender);
    }

    /// @notice Get both IPFS hashes in a single call
    /// @return blackSwanIPFS The Black Swan analysis IPFS hash
    /// @return marketPeakIPFS The Market Peak analysis IPFS hash
    function getBothAnalysisIPFS()
        external
        view
        returns (string memory blackSwanIPFS, string memory marketPeakIPFS)
    {
        return (blackSwanAnalysisIPFS, marketPeakAnalysisIPFS);
    }

    /// @notice Get all data (scores and IPFS hashes) in a single call
    /// @return blackSwan The current Black Swan score
    /// @return marketPeak The current Market Peak score
    /// @return blackSwanIPFS The Black Swan analysis IPFS hash
    /// @return marketPeakIPFS The Market Peak analysis IPFS hash
    function getAllData()
        external
        view
        returns (
            uint256 blackSwan,
            uint256 marketPeak,
            string memory blackSwanIPFS,
            string memory marketPeakIPFS
        )
    {
        return (
            blackSwanScore,
            marketPeakScore,
            blackSwanAnalysisIPFS,
            marketPeakAnalysisIPFS
        );
    }

    /// @notice Pause the contract (only owner)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract (only owner)
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Authorize contract upgrades (only owner)
    /// @param newImplementation Address of the new implementation contract
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
