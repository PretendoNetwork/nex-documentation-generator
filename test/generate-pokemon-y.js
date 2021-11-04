const DDL = require('ddl-parser');
const { generateDocumentation } = require('..');
const pokemonDumpPath = `${__dirname}/../pokemony/exefs/code.bin`;

const trees = DDL.parse(pokemonDumpPath);
//const tree = trees[3];

//generateDocumentation(tree, `${__dirname}/pokemony`);

for (const tree of trees) {
	generateDocumentation(tree, `${__dirname}/doc/pokemony`);
}

/*
for (const tree of trees) {
	const serialized = ESSerializer.serialize(tree, {
		ignoreProperties: ['fd']
	});
	fs.writeFileSync(`${__dirname}/pokemon-y-tree-${trees.indexOf(tree)}.json`, JSON.stringify(JSON.parse(serialized), null, 4)); // write pretty-printed
}
*/