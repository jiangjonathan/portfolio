const songName = "take me by the hand ft. Bladee";
const featurePattern = /\b(?:ft\.?|feat\.?|featuring|&|x)\s+(.+?)(?:\s*$|\s*\(|\s*\[)/i;
const match = songName.match(featurePattern);
console.log("Song name:", songName);
console.log("Match:", match);
if (match && match[1]) {
  console.log("Featured artist:", match[1].trim());
} else {
  console.log("No match found");
}
