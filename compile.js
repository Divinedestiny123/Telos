const fs = require('fs');
const solc = require('solc');
const path = require('path');

const contractPath = path.resolve(__dirname, 'contracts', 'TelosPerps.sol');
const oraclePath = path.resolve(__dirname, 'contracts', 'OKXOracle.sol');

const source = fs.readFileSync(contractPath, 'utf8');
const oracleSource = fs.readFileSync(oraclePath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'TelosPerps.sol': {
      content: source,
    },
    'OKXOracle.sol': {
      content: oracleSource,
    }
  },
  settings: {
    evmVersion: 'paris',
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  output.errors.forEach(err => console.error(err.formattedMessage));
}

const contract = output.contracts['TelosPerps.sol']['TelosPerps'];
const abi = contract.abi;
const bytecode = contract.evm.bytecode.object;

fs.writeFileSync(
  path.resolve(__dirname, 'src', 'lib', 'TelosPerpsABI.json'),
  JSON.stringify(abi, null, 2)
);

fs.writeFileSync(
  path.resolve(__dirname, 'src', 'lib', 'TelosPerpsBytecode.json'),
  JSON.stringify({ bytecode }, null, 2)
);

const oracleContract = output.contracts['OKXOracle.sol']['OKXOracle'];
const oracleAbi = oracleContract.abi;
const oracleBytecode = oracleContract.evm.bytecode.object;

fs.writeFileSync(
  path.resolve(__dirname, 'src', 'lib', 'OKXOracleABI.json'),
  JSON.stringify(oracleAbi, null, 2)
);

fs.writeFileSync(
  path.resolve(__dirname, 'src', 'lib', 'OKXOracleBytecode.json'),
  JSON.stringify({ bytecode: oracleBytecode }, null, 2)
);

console.log('Contracts compiled successfully!');
