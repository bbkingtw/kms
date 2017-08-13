var fs=require('fs');
var log=console.log;
var express=require('express')
var path=require('path')
var app=express()
var bodyparser=require('body-parser')
var uuid=require('uuid');
var _=require('lodash');

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

function draw_record(req,res,next){
	res.render('form.jade',{
		inputs:fields
	});
}

function draw_table(req,res){
	res.render('draw_table.jade', {
		tables:[{
			title:'draw_table',
			fields:fields,
			data:req.session.table
		}]
	});
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

app.get('/kms/table/save', function(req,res){
	var s=JSON.stringify(req.session.table);
	fs.createWriteStream('x.cfg').write(s);
	res.send('done <a href="/kms/table/load">reload</a>');
});

app.get('/kms/table/load', function(req,res,next){
	var s=JSON.stringify(req.session.table);
	fs.readFile('x.cfg', function(err, s){
		req.session.table=JSON.parse(s);
		next()
	});
},draw_table);

app.listen(8099)

log(new Date());
