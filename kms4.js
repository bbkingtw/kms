var async=require('async');
var prettyjson=require('prettyjson');
var util=require('util')
var ip=require('ip').address();
var json2html=require('json2html');
var chalk=require('chalk');
var bgYellow=chalk.bgYellow;
var bgRed=chalk.bgRed.white;
var fs=require('fs');
var argv=require('optimist').argv;
var log=console.log;
var express=require('express');
var path=require('path');
var app=express();
var bodyparser=require('body-parser');
var uuid=require('uuid');
var _=require('lodash');
//var json2html=require('json-to-html');

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
	if (req.url.indexOf('/cdn')==0) return next();
	if (req.url.indexOf('/kms/config')==0) return next();
	log('req.session',req.session)

	if (req.session.config_filename) {
		log('res',res.locals)
		app.locals.config_filename=req.session.config_filename;
		log('app',app.locals)
		return next();
	}
	else {
		return res.redirect('/kms/config/browse'); 
	}
});

if (false)
app.use(function(req,res,next){
	app.locals.input_types=input_types;
	if (!req.session.table) req.session.table=[];
	if (!req.session.fields) req.session.fields=default_fields;
	req.session.fields.map(function(e){
		if(!e.id) e.id=uuid();
	});
	next();
});


var util_db=function(table){
	return {
		find:function(criteria, cb){
			ret=_.filter(table, criteria);
			cb(null, ret);
		},	
		findOne:function(criteria, cb){
			ret=_.filter(table, criteria);
			cb(null, ret[0]);
		},	
		remove:function(criteria, cb){
			ret=_.remove(table, criteria);
			cb(null, ret);
		}	
	}	
};

app.get('/kms/config/browse', function(req,res){
	fs.readdir(__dirname,function(err,files){
		files=_.filter(files, function(e){
			log(e, path.extname(e));
			return path.extname(e).toLowerCase()=='.cfg'; 
		});
		log('files',files);
		async.map(files, get_file_info, function(err, files){
			log(files);
			res.render('draw_configs.jade',{files:files});
		})
	});

	function get_file_info(s, cb) {
		fs.stat(s, function(err,stats){
			if (err) return cb(err);
			stats.filename=s;
			stats.size=stats.size;
			cb(null, stats);
		});
	}
});

function modified(req,res,next){
	app.locals.config_modified=true;
	next();
}

function reset(req,res,next){
	app.locals.config_modified=false
	next();
}

app.post('/kms/config/delete', function(req,res){
	fs.exists(req.body.filename, function(exists){
		if (!exists) return res.send({
			status:'error', 
			error:req.body.filename+' is not exists'
		});

		fs.unlink(req.body.filename, function(err){
			if (err) return res.send({status:'error', error:err.message});
			res.send({status:'done'});
		});
	})
});

app.get('/kms/new_record', draw_single_row);
app.post('/kms/single_row/new', function(req,res,next){
	req.body.id=uuid();
	req.session.table.push(req.body);
	next();
}, modified, draw_rows);

app.get('/kms/single_row/new', draw_single_row);

app.get('/kms/single_row/edit/:id', locate_row, draw_single_row);

function xxx1(req,res){
	var db=util_db(req.session.table);

	db.findOne({id:req.params.id}, function(err,obj){
		req.row_located=obj;
		draw_single_row(req,res);
	});
}

app.get('/kms/single_row/copy/:id', locate_row, function(req,res,next){
	req.row_located.id=uuid();
	next();
}, draw_single_row);

function xxx2(){
	var db=util_db(req.session.table);

	db.findOne({id:req.params.id}, function(err, obj){
		if(err) return res.send(err);
		req.row_located=_.clone(obj);
		req.row_located.id=uuid();
		draw_single_row(req,res);
	});
};

app.get('/kms/single_row/delete/:id', function(req,res,next){
	var db=util_db(req.session.table);

	db.remove({id:req.params.id}, function(err,results){
		if(err) return res.send('err for remove record');
		else next();
	})
}, modified, draw_rows);

app.post('/kms/single_row/copy/:id', function(req,res,next){
	req.body.id=uuid();
	req.session.table.push(req.body);
	next();
}, modified, draw_rows);

function locate_row(req,res,next){
	var db=util_db(req.session.table);

	db.findOne({id:req.params.id}, function(err, obj){
		if (err) return res.send({err:err});
		req.row_located=obj;	
		next();
	});		
}

app.get('/kms/single_row/edit/:id', locate_row, draw_single_row);


var default_fields= [
	{fname:'fab', ftype:'select', values:[1,2,3]},
	{fname:'caption', ftype:'string', nullable:'no'},
	{fname:'host', ftype:'string', nullable:'no'},
	{fname:'port', ftype:'number', default:22},
	{fname:'userid', ftype:'string'},
	{fname:'password', ftype:'string', encrypted:'yes'}
]

var input_types=['string','number','select','date','week','time','datetime','email','color']; 

var cfg_fields=[
	{fname:'id', ftype:'string'},
	{fname:'fname', ftype:'string'},
	{
		fname:'ftype', ftype:'select', 
		values:input_types,
		default:'string'
	},
	{fname:'encrypted', ftype:'select', values:['yes','no'], default:'no'},
	{fname:'nullable', ftype:'select', values:['yes','no'], default:'no'},
	{fname:'values', ftype:'string'}
]


function json2table(json) {
	var ar=[];

	for (var k in json) {
		var obj={};
		obj.key=k;
		obj.val=json[k];
		ar.push(obj);
	}
}

function draw_fields(req,res){
	req.session.fields.map(function(e){
		if (!e.id) e.id=uuid();
	});

	var payload={
		title:'fields definition',
		fields:cfg_fields,
		data:req.session.fields
	}

	app.render('draw_fields.jade', payload, function(err,html){
		if (err) {
			var	data={} 
			data.render_error=err.message.split('\n');
			data.payload=payload;
			return res.send(json2html.render(data));
		}
		else 
			res.send(html);
	});
}

function draw_rows(req,res){
	var payload={
		title:'all data records',
		fields:req.session.fields,
		data:req.session.table
	}

	var tables=[
		payload, {
			title:'fields', 
			fields:cfg_fields,
			data:req.session.fields
		}
	]

	app.render('draw_rows.jade', payload, function(err,html){
		if (err) {
			var	data={} 
			data.render_error=err.message.split('\n');
			data.table=tables;
			return res.send(json2html.render(data));
		}
		else 
			res.send(html);
	});
}

app.get('/kms/rows/browse', draw_rows);

app.post('/kms/single_row/edit/:id', update_row, modified, draw_rows);
app.post('/kms/single_row/copy/:id', update_row, save_row, modified, reply_row_data);

function save_row(req,res,next){
	var id=req.body.id;
	var x=_.filter(req.session.table, {id:id})[0];
	if(x) x=_.merge(x, req.body);
	else req.session.table.push(req.body);

	save_table(req,res,next)
}

function reply_row_data(req,res){
	res.send({
		status:'done',
		row_updated:req.row_updated
	});
};

function update_row(req,res,next){
	var db=util_db(req.session.table);

	db.findOne({id:req.params.id}, function(err, obj){
		if(err) return res.send(err);
		for (var k in obj) if (k!='id') delete obj[k];
		log('original',obj);
		log('data',req.session.table);
		obj=_.merge(obj, req.body);
		req.row_updated=obj;
		next();
	});
}

app.post('/kms/new_record', function(req,res,next){
	req.body.id=uuid();
	req.session.table.push(req.body);
	next();
}, modified, draw_rows);

app.get('/cdn/jquery.js', function(req,res){
	var lib=req.params.lib;
	var fname=path.join(__dirname,'bower_components',lib,'dist',lib+'.js')
	res.sendfile(fname);
});

app.get('/cdn/:lib', function(req,res){
	var lib=req.params.lib;
	var fpath=path.join(__dirname,'bower_components',lib);
	var fname=path.join(fpath,'bower.json');

	fs.readFile(fname, function(err,contents){
		var obj=JSON.parse(contents);
		var fname=path.join(fpath, obj.main);
		res.sendfile(fname);
	});
});


function convert_json(table, fields, action) {
	var secret_fields=_.filter(fields, {encrypted:'yes'});
	log('sfield', secret_fields);

	var out=_.clone(table);
	log('out', out);
	
	if (false)
	out.map(function(row){
		secret_fields.map(function(e){
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


//app.post('/kms/table/update_all', function(req,res,next){
//	log('=============>',req.session.table);
//	req.session.table=req.body.table;
//	next();
//}, save_table, function(req,res){
//	if (req.xhr) res.send('done')
//	else draw_rows(req,res);
//});

app.post('/kms/table/update', function(req,res,next){
	var x=_.filter(req.session.table,{id:req.body.id})[0];
	x=_.merge(x, req.body);
	next();
}, save_table, function(req,res){
	if (req.xhr) res.send('done')
	else draw_rows(req,res);
});

app.get('/kms/fields/browse', draw_fields);

app.post('/kms/fields/update_all', function(req,res,next){
	log('=============>',req.session.fields);
	req.session.fields=req.body.fields;
	next();
}, save_table, function(req,res){
	if (req.xhr) res.send('done')
	else draw_rows(req,res);
});

app.post('/kms/fields/update', function(req,res,next){
	var x=_.filter(req.session.fields,{id:req.body.id})[0];
	x=_.merge(x, req.body);
	next();
}, save_table, function(req,res){
	if (req.xhr) res.send('done')
	else draw_rows(req,res);
});

function file_info(fname, cb) {
	fs.readFile(fname, function(err, s){
		if(err) return cb(0);
		var obj=JSON.parse(s);
		cb(obj.table.length);
	})
}

function save_table(req,res,next){
	var out=convert_json(req.session.table, req.session.fields, 'encrypt')
	var obj={table:out, fields:req.session.fields};

	if (req.query.filename) 
		var filename=req.query.filename; 
	else 
		var filename=req.session.config_filename;

	var sext=path.extname(filename);

	log('0',filename);

	if (sext=='') 
		filename=filename+'.cfg';
	else 
		filename.replace(new RegExp(sext+'$'), '.cfg');

	log('1',filename);

	req.session.config_filename=filename;

	fs.exists(req.session.config_filename, function(exists){
		if (exists && out.length==0){ 
			file_info(req.session.config_filename, function(size){
				if (size > 0){
					log(bgRed('old file exist already, and right now is zero'));
					log('next() exist', (next));

					if (next) 
						next();	
					else {
						return res.send(util.format(
							'can\'t overwrite existing table(%d records) with null'+
							'<br><a href="/kms/table/load">load first</a>',size
						))
					}
				}
				else go_write();
			})
		}
		else go_write()

		function go_write() {
			var options = {
				noColor: true
			};
 
			//console.log(prettyjson.render(obj, options));

			var s=JSON.stringify(obj);
			log('start to save',s);
			fs.createWriteStream(req.session.config_filename).write(s);

			if(next) {
				log('next exists');
				next();
			}
			else {
				log('next is not exists');
				return res.send('done <a href="/kms/table/load">reload</a>');
			}
		}
	});	
};

//app.get('/kms/table/load', load_table, draw_rows);
app.get('/kms/config/load/:file', load_table, reset, draw_rows);
app.post('/kms/config/save', save_table, reset, draw_rows);
app.get('/kms/config/save', save_table, reset, draw_rows);

function load_table(req,res,next){
	var fname=req.params.file;
	log('fname', fname);

	fs.exists(fname, function(exists){
		if (exists) return read_file();
		req.session.fields=default_fields;
		req.session.table=[];
		next();
	});

	function read_file(){
		fs.readFile(fname, function(err, s){
			if(err) return res.send(err);
			var obj=JSON.parse(s)
			//if (!obj.fields) obj.fields=default_fields;
			if (!obj.table) obj.table=[]
			if (!obj.fields) obj.fields=default_fields;

			req.session.fields=obj.fields;
			req.session.table=convert_json(obj.table, obj.fields, 'decrypt');
			req.session.dataloaded=true;
			req.session.config_filename=fname;
			app.locals.config_filename=fname;
			next()
		});
	}
}
function locate_field_id(req,res,next){
	req.field_located=_.filter(req.session.fields,{id:req.params.id})[0];
	log(bgYellow('session.fields'), req.session.fields);
	log(bgYellow('req.params.id'), req.params.id);
	log(bgYellow('field_located'), req.field_located);

	if (!req.field_located) return res.send(json2html.render({
		err:'no field id='+req.params.id+' exist',
		cfg_fields:cfg_fields,
		session_fields:req.session.fields
	}));

	next();
}

function draw_single_row(req,res,next){
	req.row_located=req.row_located||[];

	var id=req.row_located.id;
	log(bgYellow('id', id));

	if (id){
		var all_ids=req.session.table.map(function(e){return e.id});
		log(bgYellow('all_ids', all_ids));

		var pre=all_ids.indexOf(id)-1;
		log(bgYellow('pre', pre));
		if (pre==-1) pre=Math.max(all_ids.length-1,0);
		prev_row=all_ids[pre]
		log(bgYellow('pre2', pre, prev_row));

		var pos=all_ids.indexOf(id)+1;
		log(bgYellow('pos', pos));
		if (pos==all_ids.length) pos=0;
		next_row=all_ids[pre]
		log(bgYellow('pos2', pos, next_row));
	}
	else {
		log(bgRed('no id', req.row_located))
	}

	app.render('single_row.jade',{
		inputs:req.session.fields,
		values:req.row_located,
		action_url:req.url,
		prev_row:prev_row,
		next_row:next_row
	}, function(err, html){
		if (err) return res.send(err);
		if (req.xhr) res.send({status:'done', html:html});
		else res.send(html);
	});
}

function draw_single_field(req,res) {
	var id=req.field_located.id;

	var all_ids=req.session.fields.map(function(e){return e.id});

	var pre=all_ids.indexOf(id)-1;
	if (pre==-1) pre=all_ids.length-1;

	var pos=all_ids.indexOf(id)+1;
	if (pos==all_ids.length) pos=0;

	res.render('single_field.jade',{
		inputs:cfg_fields,
		values:req.field_located,
		prev_field:all_ids[pre],
		next_field:all_ids[pos]
	});
}

function debug_field(req,res,next){
	if (req.query.debug) return res.send(json2html.render({fields:req.session.fields}));
	next();
}

app.post('/kms/fields/copy/:id', function(req,res){
	res.send(req.body);
});

//app.use('/kms/single_field', debug_field);

app.get('/kms/single_field/delete/:id', locate_field_id, function(req,res,next){
	log('bbbbbbbbbbbbbb', req.session.fields);
	log('kill', req.field_located);
	req.session.fields=_.reject(req.session.fields, req.field_located);
	log('aaaaaaaaaaaaaaaa', req.session.fields);
	next();
}, modified, draw_fields);

app.get('/kms/single_field/new', function(req,res,next){
	req.field_located={
		id:uuid()
	};
	next()
}, draw_single_field); 

app.get('/kms/single_field/copy/:id', locate_field_id, function(req,res,next){
	req.field_located=_.clone(req.field_located);
	req.field_located.id=uuid();
	next()
}, draw_single_field); 

function warn_uid_exists(field_name) {
	return function(req,res,next){
		var q={}
		q[field_name]=req.body[field_name]
		var found=_.filter(req.session.fields, q);
		log('query', q);
		log('session',req.session.fields);
		log('found',found);

		var sError;

		var bWarn=found.length>1;
		if(bWarn) sError='found dup value cnt='+found.length+'>1';

		log('bWarn1',bWarn);
		log('sError',sError);

		if (!bWarn && found.length==1) {
			log('found.id',found[0].id);
			bWarn=found[0].id != req.body.id;
			log(bgYellow('found id', found[0].id));
			log(bgYellow('bodyx id', req.body.id));
			if(bWarn) sError='found dup value at '+JSON.stringify(found[0]);	
		}

		log('bWarn2',bWarn);
		log('sError',sError);

		if (bWarn) {
			req.field_located=req.body;
			log('before',req.field_located);
			log(bgRed('error found'));
			req.field_located[field_name+'_error']=sError;
			log('after',req.field_located);
			//return res.send(req.field_located);
			draw_single_field(req, res);
		}
		else 
			next();
	}
}

app.post('/kms/single_field/new', warn_uid_exists('fname'), function(req,res,next){
	req.session.fields.push(req.body);	
	next();
}, modified, draw_fields);

app.post('/kms/single_field/copy/:id', warn_uid_exists('fname'), function(req,res,next){
	req.session.fields.push(req.body);	
	next();
}, modified, draw_fields);

app.post('/kms/single_field/edit/:id', warn_uid_exists('fname'), function(req,res,next){
	var x=_.filter(req.session.fields,{id:req.body.id})[0];
	x=_.merge(x, req.body);
	next();
}, modified, draw_fields);

app.get('/kms/single_field/edit/:id', locate_field_id, draw_single_field);
app.get('/kms/v1/uuid', function(req,res){
	res.send(uuid());
})

var port=argv.port||8099
log('listen at',port);
log('http://localhost:'+port+'/kms');
app.listen(port)

log(new Date());
