var fs=require('fs');
var log=console.log;
var express=require('express')
var path=require('path')
var app=express()
var bodyparser=require('body-parser')
var uuid=require('uuid');
var _=require('lodash');

var crypto = require('crypto');
var algorithm = 'aes-256-ctr';
var password = 'd6F3Efeqjlkajlsdjlasd';

function dfile(s){
	return path.join(__dirname, s);
}

function encrypt(text){
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}
 
function decrypt(text){
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}
 

app.use(bodyparser());
app.use(require('express-session')({
	secret:uuid()
}));

app.use(function(req,res,next){
	if (!req.session.table) req.session.table=[];
	next();
});


var util_db=function(table){
	return {
		find:function(criteria, cb){
			ret=_.filter(table, criteria);
			cb(null, ret);
		},	
		remove:function(criteria, cb){
			ret=_.remove(table, criteria);
			cb(null, ret);
		}	
	}	
};

app.get('/kms/delete_record/:id', function(req,res){
	var db=util_db(req.session.table);

	db.remove({id:req.params.id}, function(err,results){
		draw_table(req,res);
	})
})

app.get('/kms/copy_record/:id', function(req,res){
	var db=util_db(req.session.table);

	db.find({id:req.params.id}, function(err,results){
		res.locals.values=_.clone(results[0]);
		draw_record(req,res);
	});
});

app.post('/kms/copy_record/:id', function(req,res,next){
	req.body.id=uuid();
	req.session.table.push(req.body);
	next();
}, draw_table);

app.get('/kms/edit_record/:id', function(req,res){
	var db=util_db(req.session.table);

	db.find({id:req.params.id}, function(err,results){
		res.locals.values=results[0];
		draw_record(req,res);
	});
})

app.get('/kms/new_record', draw_record);

var fields= [
	{fname:'fab', ftype:'select', values:[1,2,3]},
	{fname:'caption', ftype:'string', nullable:'no'},
	{fname:'host', ftype:'string', nullable:'no'},
	{fname:'port', ftype:'number', default:22},
	{fname:'userid', ftype:'string'},
	{fname:'password', ftype:'string', encrypted:'yes'}
]

var cfg_fields=[
	{fname:'fname', ftype:'string'},
	{fname:'ftype', ftype:'select', values:['string','number','select'], default:'string'},
	{fname:'encrypted', ftype:'select', values:['yes','no'], default:'no'},
	{fname:'values', ftype:'string'}
]

function draw_record(req,res,next){
	res.render('form.jade',{
		inputs:fields
	});
}

function json2table(json) {
	var ar=[];

	for (var k in json) {
		var obj={};
		obj.key=k;
		obj.val=json[k];
		ar.push(obj);
	}
}

function draw_table(req,res){
	res.render('draw_table.jade', {
		tables:[{
			title:'draw_table',
			fields:req.session.fields,
			data:req.session.table
		},{
			title:'fields', 
			fields:[
				{fname:'fname', ftype:'string'},
				{fname:'ftype', ftype:'string'},
				{fname:'encrypted', ftype:'string'},
				{fname:'values', ftype:'string'}
			],
			data:fields
		}]})
}

app.get('/kms/table', draw_table);

app.post('/kms/edit_record/:id', function(req,res,next){
	var db=util_db(req.session.table);

	db.find({id:req.params.id}, function(err, docs){
		if(err) return res.send(err);
		for (var k in docs[0]) if (k!='id') delete docs[0][k];
		log('original',docs[0]);
		log('data',req.session.table);
		docs[0]=_.merge(docs[0], req.body);
	});
	next();
}, draw_table);

app.post('/kms/new_record', function(req,res,next){
	req.body.id=uuid();
	req.session.table.push(req.body);
	next();
}, draw_table);

app.get('/cdn/:lib', function(req,res){
	var lib=req.params.lib;
	var fname=path.join(__dirname,'bower_components',lib,'dist',lib+'.js')
	res.sendfile(fname);
});

var json2html=require('json-to-html');

function convert_json(table, fields, action) {
	var secret_field=_.filter(fields, {encrypted:'yes'});
	log('sfield', secret_field);

	var out=_.clone(table);
	log('out', out);
	
	out.map(function(row){
		secret_field.map(function(e){
			var sfield=e.fname;
			log('sfield',sfield);
			log('oo',row[sfield]);

			if (action=='encrypt')
				row[sfield]=encrypt(row[sfield]);
			else
				row[sfield]=decrypt(row[sfield]);

			log('nn',row[sfield]);
		});
	});

	return out;
}

app.get('/kms/file/:file', function(req,res,next){
	fs.createReadStream(dfile(req.params.file)).pipe(res);
});

app.get('/kms/table/save', save_table);

function save_table(req,res){
	var out=convert_json(req.session.table, fields, 'encrypt')
	var obj={table:out, fields:fields};

	fs.exists('x.cfg', function(exists){
		if (exists && out.length==0) 
			return res.send('can\'t overwrite existing table with null'+
			 	'<br><a href="/kms/table/load">load first</a>')

		var s=JSON.stringify(obj);
		fs.createWriteStream('x.cfg').write(s);
		return res.send('done <a href="/kms/table/load">reload</a>');
	});	
};

app.get('/kms/table/load', function(req,res,next){
	var s=JSON.stringify(req.session.table);

	fs.readFile('x.cfg', function(err, s){
		var obj=JSON.parse(s)
		req.session.table=convert_json(obj.table, obj.fields, 'decrypt');
		req.session.fields=obj.fields;
		next()
	});
},draw_table);

app.post('/kms/template/edit/:fname', function(req,res){
	var x=_.filter(fields,{fname:req.params.fname})[0];
	x=_.merge(x, req.body);
	save_table(req,res);	
});

app.get('/kms/template/edit/:fname', function(req,res){
	res.locals.values=_.filter(fields,{fname:req.params.fname})[0];
	if (!res.locals.values) return res.send({
		err:'no field '+req.params.fname+' exist',
		cfg_fields:cfg_fields
	});

	var sfields=fields.map(function(e){return e.fname});
	var prev=sfields.indexOf(req.params.fname)-1;
	if (prev==-1) prev=sfields.length-1;
	var next=sfields.indexOf(req.params.fname)+1;
	if (next==sfields.length) next=0;

	res.render('template.jade',{
		inputs:cfg_fields,
		prev_field:sfields[prev],
		next_field:sfields[next]
	});
});

app.listen(8099)

log(new Date());
