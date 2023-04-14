const { program } = require('commander');
const DDL = require('ddl-parser');
const { generateDocumentation } = require('./');

program
	//.option('-d, --decrypt', 'Decrypt title') // Decryption not added yet
	.option('-i, --input <path> (Required)', 'Input game dump')
	.option('-o, --output <path> (Required)', 'Output documentation path');

program.parse(process.argv);

const { input, output } = program.opts();

if (!input || !output) {
	console.error('Missing required params');
	console.log(program.helpInformation());

	return;
}

const trees = DDL.parse(input);

for (const tree of trees) {
	generateDocumentation(tree, output);
}