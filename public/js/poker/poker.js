// Define a function to compare the highest combination of each player
function compareHands(table, ...players) {
    // Function to get the rank of a card
    const getRank = (card) => "23456789TJQKA".indexOf(card[0]) + 2;
    // Function to get the suit of a card
    const getSuit = (card) => card[1];

    // Define combinations
    const combinations = ["High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush", "Royal Flush"];

    // Define function to determine hand type
    function determineHand(cards) {
        const ranks = cards.map(card => getRank(card)).sort((a, b) => a - b);
        const suits = cards.map(card => getSuit(card));

        const isFlush = suits.every(suit => suit === suits[0]);
        const isStraight = ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);

        const groupedRanks = ranks.reduce((acc, rank) => {
            acc[rank] = (acc[rank] || 0) + 1;
            return acc;
        }, {});

        const distinctRanks = Object.keys(groupedRanks).length;
        const maxRepeated = Math.max(...Object.values(groupedRanks));

        if (isFlush && isStraight) {
            return ranks[4] === 14 ? combinations[9] : combinations[8]; // Royal Flush or Straight Flush
        } else if (maxRepeated === 4) {
            return combinations[7]; // Four of a Kind
        } else if (distinctRanks === 2 && maxRepeated === 3) {
            return combinations[6]; // Full House
        } else if (isFlush) {
            return combinations[5]; // Flush
        } else if (isStraight) {
            return combinations[4]; // Straight
        } else if (maxRepeated === 3) {
            return combinations[3]; // Three of a Kind
        } else if (distinctRanks === 3 && maxRepeated === 2) {
            return combinations[2]; // Two Pair
        } else if (distinctRanks === 4 && maxRepeated === 2) {
            return combinations[1]; // One Pair
        } else {
            return combinations[0]; // High Card
        }
    }

    // Initialize variables to keep track of the highest hand and the winner
    let highestHand = '';
    let winner = '';

    // Iterate through each player's hand and compare the hands
    players.forEach((player, index) => {
        const hand = player.concat(table);
        const currentHand = determineHand(hand);

        // If the current hand is stronger than the highest hand, update the highest hand and the winner
        if (combinations.indexOf(currentHand) > combinations.indexOf(highestHand)) {
            highestHand = currentHand;
            winner = `Player ${index + 1}`;
        }
    });

    // Return the winner and the highest hand
    return { winner, highestHand };
}

// Example usage
const table = ["AH", "2S", "3D", "4C", "5H"];
const p1 = ["9C", "10D"];
const p2 = ["JD", "QS"];

const result = compareHands(table, p1, p2);
console.log(`Winner: ${result.winner}, Highest Hand: ${result.highestHand}`);
