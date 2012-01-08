// ==================================
// Sia Core
// 
// By: John Norton
// ==================================

var options = {
	turntable : {
		//you can find these using http://alaingilbert.github.com/Turntable-API/bookmarklet.html
		userid : 'turntable_userid',
		authid : 'turntable_authid', 
		roomid : 'turntable_roomid',
		port   : 9000, //a port for node to respond on.
		host   : '127.0.0.1' //if you run the bot locally
	},
	lastfm : {
		apikey : 'last.fm_aki_key',
		secret : 'last.fm_secret',
		useragent: 'turntable-bot/v0.5 Sia'
	},
	details : {
		version  : '0.8',
		author   : 'Bitwise (@jukebox42)',
		bot_name : 'Sia' //bot responds to this name e.x. (sia autoskip on)
	},
	settings : {
		autobop  : true,
		autoskip : false,
		silence  : false
	}
};

var sia = require('./sia_core').SiaCore(options);