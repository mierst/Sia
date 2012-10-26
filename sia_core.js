// ==================================
// Sia Core
// 
// By: John Norton
// ==================================

var LastFmNode = require('lastfm').LastFmNode;
var Bot = require('ttapi');
var bot;

var SiaCore = function (opts) {
	var self = this,
		lastfm,
		usersList = { },
		userRequestList = [],
		currentSong = {
			djid: 0,
			name: '',
			artist: '',
			votes: {
				up: 0,
				down: 0
			},
			listeners: 0,
			adds: 0
		};
	
	var init = function() {
		bot = new Bot(opts.turntable.authid, opts.turntable.userid, opts.turntable.roomid);
		bot.listen(opts.turntable.port, opts.turntable.host);
		
		lastfm = new LastFmNode({
		  api_key: opts.lastfm.apikey,
		  secret: opts.lastfm.secret,
		  useragent: opts.lastfm.useragent
		});
		
		initUserListEvents();
		initSongEvents();
		initChatEvents();
	}
	
	//user list events
	var initUserListEvents = function() {
		// Initial startup pass
		bot.on('roomChanged', function (data) {
			usersList = { };
			for (var i=0; i<data.users.length; i++) {
				updateUserActivity(data.users[i], new Date());
			}
		});
		
		// Someone enter the room, add him.
		bot.on('registered', function (data) {
			updateUserActivity(data.user[0], new Date());
		});

		// Someone left, remove him from the users list.
		bot.on('deregistered', function (data) {
			updateUserActivity(data.user[0]);
		});
		
		// Someone vote, update his timestamp.
		bot.on('update_votes', function (data) {
			var votelog = data.room.metadata.votelog;
			for (var i=0; i<votelog.length; i++) {
				updateUserActivity(usersList[votelog[i][0]], new Date());
			}
			getCurrentSongInfo();
			currentSong.votes.up = data.room.metadata.upvotes;
			currentSong.votes.down = data.room.metadata.downvotes;
			currentSong.listeners = data.room.metadata.listeners-1;
		});

		// Someone step up, update his timestamp.
		bot.on('add_dj', function (data) {
			var user = data.user[0];
			updateUserActivity(user, new Date());
			
			bot.roomInfo(false,function(roomdata) {
				if(roomdata.room.metadata.djs.length == 5) {
					var saves = [];
					for(var i=0; i < userRequestList.length; i++) {
						if(userRequestList[i].requesttype == 'savespot') {
							saves.push([i, userRequestList[i].userid]);
						}
					}
					for(i=0; i < saves.length; i++) {
						if(saves[i].userid != user.userid)
							bot.remDj(user.userid);
						else {
							i--;
							userRequestList.splice(saves[i],1);
						}
					}
				}
			});
		});

		// Someone step down, update his timestamp.
		bot.on('rem_dj', function (data) {
			updateUserActivity(data.user[0], new Date());
			
			for(var i=0; i < userRequestList.length; i++) {
				if(userRequestList[i].requesttype == 'dropdj' && userRequestList[i].userid == data.user[0].userid) {
					i--;
					userRequestList.splice(i,1);
				}
			}
		});

		// Someone added the current song to his playlist.
		bot.on('snagged', function (data) {
			var user = usersList[data.userid];
			updateUserActivity(user, new Date());
			
			currentSong.adds++;
		});
		
		bot.on('speak', function (data) {
			var user = usersList[data.userid];
			updateUserActivity(user, new Date());
		});
	}
	
	var initSongEvents = function() {
		bot.on('newsong', function (data) {
			currentSong = {
				djid: data.room.metadata.current_dj,
				name: data.room.metadata.current_song.metadata.song,
				artist: data.room.metadata.current_song.metadata.artist,
				votes: {
					up: 0,
					down: 0
				},
				listeners: data.room.metadata.listeners-1,
				adds: 0
			}
			if(opts.settings.autoskip && data.room.metadata.current_dj == opts.turntable.userid) {
				if(!opts.settings.silence)
					bot.speak('skipping');
				setTimeout(function() {bot.skip();},500);
				return;
			}
			if(opts.settings.autobop && data.room.metadata.current_dj != opts.settings.userid) {
				setTimeout(
					function() {
						if(currentSong.votes.down > currentSong.votes.up && currentSong.votes.down > currentSong.listeners * .3) {
							bot.vote('down');
						} else if(currentSong.votes.down > currentSong.votes.up) {
							//do nothing
						} else {
							bot.vote('up');
							var use_saying = Math.floor(Math.random() * 10);
							if(use_saying < 2) {
								var sayings = [
									'Man I love this song!',
									'Ooooo Love this!',
									'Nice tune'
								];
								if(opts.settings.silence)
									bot.speakRand(sayings);
							}
						}
					},
					Math.floor(Math.random() * 60)*1000+1
				)
			}
		});
		
		bot.on('endsong', function () {
			var lastplayer = currentSong.djid;
			for(var i=0; i < userRequestList.length; i++) {
				if(userRequestList[i].userid == lastplayer && userRequestList[i].requesttype == 'dropdj') {
					if(userRequestList[i].songs <= 0) {
						bot.remDj(userRequestList[i].userid);
						i--;
						userRequestList.splice(i,1);
					} else
						userRequestList[i].songs--;
				}
			}
			if(currentSong.name != '') {
				if(!opts.settings.silence && !(opts.settings.autoskip && currentSong.djid == opts.details.userid)) {
					bot.speak('Last Played: "'+currentSong.name+'" by '+currentSong.artist+' | '
						+currentSong.votes.up+'▲ '
						+currentSong.votes.down+'▼ '
						+currentSong.listeners+'♫ '
						+currentSong.adds+'♥');
				}
			}
		});
	}
	
	var initChatEvents = function() {
		bot.on('speak', function (data) {
			if(data.name == opts.details.bot_name)
				return;
			
			//sayings array for rand speach
			var sayings = [];
		
			// === ai functions ===
			if(data.text.match(/^(is there a queue|queue)\?*$/)) {
				bot.speak('There\'s no queue. It\'s Free For All.');
				return;
			}
			//anti afk check
			if(data.text.match(new RegExp('^('+opts.details.bot_name+',? you (there|here)|you (there|here|afk) '+opts.details.bot_name+'|'+opts.details.bot_name+' afk)','i'))) {
				sayings = [
					'Yeah, I\'m here.',
					'Yep',
					'I\'m here',
					'yo',
					'nope'
				];
				bot.speakRand(sayings);
				return;
			}
			//hello
			if (data.text.match(new RegExp('^((good morning|mornin|morning|hello|hey|sup|yo|hi) ('+opts.details.bot_name+'|everyone|all)|oh herro)','i'))) {
				sayings = [
					'Hey '+data.name+'! How are you?',
					'Oh hello there '+data.name,
					'Hey '+data.name+'. What\'cha doin?',
					'Sup '+data.name+'?'
				];
				bot.speakRand(sayings);
				return;
			}
			// make sure they're talking to sia
			if(!data.text.match(new RegExp('^'+opts.details.bot_name,'i')))
				return;
			var spokentext = data.text.substring(opts.details.bot_name.length);
			
			//version
			if (spokentext == ' version') {
				bot.speak('Current version: '+opts.details.version);
				return;
			}
			//author
			if (spokentext == ' author') {
				bot.speak('Author: Bitwise (@jukebox42)');
				return;
			}
			//owner
			if (spokentext == ' owner') {
				bot.speak('Owner: '+opts.details.author);
				return;
			}
			
			if (spokentext.match(/^ (stfu|silence)/i)) {
				if(spokentext.match(/^ silence off/i))
					opts.settings.silence = false;
				else
					opts.settings.silence = true;

				sayings = [
					'silence is '+(opts.settings.silence ? 'on.' : 'off.')
				];
				bot.speakRand(sayings);
			}

			//=== voting commands ===
			//vote up
			if (spokentext.match(/^ (bob|dance|party|rock|vote)/i)) {
				bot.vote('up');
				return;
			}

			//=== dj commands ===
			//dj
			if (spokentext.match(/^ (dj|get up|up)/i)) {
				bot.addDj();
				return;
			}
			//stop djing
			if (spokentext.match(/^ (stop djgin|get down|down)/i)) {
				bot.remDj();
				return;
			}
			//skip song
			if (spokentext.match(/^ skip/i)) {
				bot.skip();
				return;
			}
			//save song
			if (spokentext.match(/^ (remember this|add song|save song)/i)) {
				bot.roomInfo(true, function(data) {
					var newSong = data.room.metadata.current_song._id;
					bot.playlistAdd(newSong);
					sayings = [
						'Got it!',
						'Added song.',
						'Recorded.',
						'Yay more songs!',
						'All my hearts are belong to this.'
					];
					bot.speakRand(sayings);
				});
				return;
			}
			//unsave song
			 if (spokentext.match(/^ (remove this|drop song|remove song)/i)) {
                                bot.roomInfo(true, function(data) {
                                        var currentSong = data.room.metadata.current_song._id;
                                        bot.playlistRemove(currentSong);
                                        sayings = [
                                                'Got it!',
                                                'Removed song.',
                                                'Recorded.',
                                                'Aww less songs!',
                                                'All my hearts no longer belong to this.'
                                        ];
                                        bot.speakRand(sayings);
                                });
                                return;
                        }

			//auto skip
			if (spokentext.match(/^ auto\s?skip/i)) {

				if(spokentext.match(/auto\s?skip on/i))
					opts.settings.autoskip = true;
				else if (spokentext.match(/auto\s?skip off/i))
					opts.settings.autoskip = false;

				sayings = [
					'autoskip is '+(opts.settings.autoskip ? 'on.' : 'off.')
				];
				bot.speakRand(sayings);
				return;
			}
			
			//auto bop
			if (spokentext.match(/^ auto\s?bop/i)) {

				if(spokentext.match(/auto\s?bop on/i))
					opts.settings.autobop = true;
				else if (spokentext.match(/auto\s?bop off/i))
					opts.settings.autobop = false;

				sayings = [
					'autobop is '+(opts.settings.autobop ? 'on.' : 'off.')
				];
				bot.speakRand(sayings);
				return;
			}
			
			//=== admin commands ===
			//drop a user after their song
			if (spokentext.match(/^ drop me after my song/i)) {
				userRequestList.push({
					requesttype: 'dropdj',
					userid: data.userid,
					songs: 0
				});
				sayings = [
					'All set '+data.name+'.',
					'I got ya covered '+data.name+'.',
					'I love dropping people! Can do '+data.name+'.'
				];
				bot.speakRand(sayings);
				return;
			}
			//save a users spot
			if (spokentext.match(/^ (brb|save my spot)/i)) {
				userRequestList.push({
					requesttype: 'savespot',
					userid: data.userid
				});
				sayings = [
					'All set '+data.name+'.',
					'I got ya covered '+data.name+'.',
					'That spot is all yours '+data.name+'!'
				];
				bot.speakRand(sayings);
				return;
			}
			
			// === fun ===
			var matches;
			if (matches = spokentext.match(/^ change your laptop to ([^\s]*)$/i)) {
				bot.modifyLaptop(matches[1]);
				sayings = [
					'Changing my laptop to '+matches[1]+'.'
				];
				bot.speakRand(sayings);
				return;
			}
			if (matches = spokentext.match(/^ change your avatar to ([^\s]*)$/i)) {
				bot.setAvatar(matches[1]);
				sayings = [
					'Changing my avatar to #'+matches[1]+'.'
				];
				bot.speakRand(sayings);
				return;
			}
			if (spokentext.match(/^ (sudo )?make me a sand(w|v)ich/i)) {
				if (data.text.match(/sudo/i)) {
					sayings = [
						'yes master.'
					];
					bot.speakRand(sayings);
				} else {
					sayings = [
						'Make your own damn sandwitch '+data.name+'!',
						'Would you like mayo on that?',
						'You\'re out of bread. maybe if you went grocery shopping once and a while I would.',
						'And if I refuse?',
						'Yes master.'
					];
					bot.speakRand(sayings);
				}
				return;
			}
			if (matches = spokentext.match(/^ harass (.*)/i)) {
				var name = matches[1];
				sayings = [
					name+' would make a lovely corpse!',
					'Hey '+name+', is that a beard, or are you eating a muskrat?',
					'Why do you sit there looking like an envelope without any address on it '+name+'?',
					name+' is a wit with dunces, and a dunce with wits...huh?',
					'I wish I\'d known '+name+' when '+name+' was alive.',
					'I look into '+name+'\'s eyes and get the feeling someone else is driving.',
					'There\'s nothing wrong with '+name+' that reincarnation won\'t cure.',
					'You\'re a good example of why some animals eat their young '+name+'.'
				];
				bot.speakRand(sayings);
				return;
			}
			
			if (spokentext.match(/^ why does everything smell like lilacs/i)) {
				sayings = [
					'Ever mix ammonia and bleach?',
					'Für ihr Gesicht!'
				];
				bot.speakRand(sayings);
				return;
			}
			
			// === Last Fm Requests ===
			if (matches = spokentext.match(/^ artist ([^\s]*)/i)) {
				console.log('getting data...');
				var lookingfor = matches[1];
				//get this data incase the song changes mid request
				var artist_name = currentSong.artist;

				if(artist_name == '') {
					bot.speak('I could not detect that there was a song playing.');
					return;
				}

				lastfm.request("artist.getinfo", {
					artist: artist_name,
					autocorrect:1,
					handlers: {
						success: function(data) {
							var artist = data.artist;
							var sayings = [];
							if(lookingfor == 'info') {
								sayings.push('===================');
								sayings.push('Artist: '+artist.name);
							}
							if(typeof artist.stats != 'undefined' && (lookingfor == 'info' || lookingfor == 'playcount'))
								sayings.push('Play Count: '+artist.stats.playcount);
							if(typeof artist.bio != 'undefined' && (lookingfor == 'info' || lookingfor == 'published' || lookingfor == 'date'))
								sayings.push('Published: '+artist.bio.published);
							if(typeof artist.tags != 'undefined' && typeof artist.tags.tag != 'undefined'  && (lookingfor == 'info' || lookingfor == 'tags')) {
								var tags = '';
								for(var i = 0; i < artist.tags.tag.length; i++) {
									tags += artist.tags.tag[i].name;
									if(i+1 < artist.tags.tag.length)
										tags += ', ';
								}
								sayings.push('Tags: '+tags);
							}
							if(typeof artist.bio != 'undefined'  && (lookingfor == 'info' || lookingfor == 'summary'))
								sayings.push('Summary: '+artist.bio.summary.replace(/<\/?\w+[^>]*>/,''));
							if(typeof artist.similar != 'undefined' && typeof artist.similar.artist != 'undefined'  && (lookingfor == 'info' || lookingfor == 'similar' || lookingfor == 'like')) {
								var similars = '';
								for(var i = 0; i < artist.similar.artist.length; i++) {
									similars += artist.similar.artist[i].name;
									if(i+1 < artist.similar.artist.length)
										similars += ', ';
								}
								sayings.push('Similar Artists: '+similars);
							}
							if(typeof artist.url != 'undefined' && (lookingfor == 'info' || lookingfor == 'url'))
								sayings.push(artist.url);
							if(lookingfor == 'info')
								sayings.push('===================');
							if(sayings.length == 0)
								sayings = ['Sorry, I could not find any information on this artist.'];
							bot.speakArray(sayings);
						},
						error: function(error) {
							console.log("Error: " + error.message);
						}
					}
				});
				return;
			}
			
			if (matches = spokentext.match(/^ song ([^\s]*)/i)) {
				console.log('getting data...');
				var lookingfor = matches[1];
				
				//get this data incase the song changes mid request
				var song = currentSong.name;
				var artist = currentSong.artist;
				if(artist == '') {
					bot.speak('I could not detect that there was a song playing.');
					return;
				}

				lastfm.request("track.getinfo", {
					artist: artist,
					track: song,
					handlers: {
						success: function(data) {
							var track = data.track;
							var sayings = [];
							if(lookingfor == 'info') {
								sayings.push('===================');
								sayings.push('Track: "'+song+'" by '+artist);
							}
							if(typeof track.wiki != 'undefined' && (lookingfor == 'info' || lookingfor == 'published'))
								sayings.push('Published: '+track.wiki.published);
							if(typeof track.toptags != 'undefined' && typeof track.toptags.tag != 'undefined' && (lookingfor == 'info' || lookingfor == 'tags')) {
								var tags = '';
								for(var i = 0; i < track.toptags.tag.length; i++) {
									tags += track.toptags.tag[i].name;
									if(i+1 < track.toptags.tag.length)
										tags += ', ';
								}
								sayings.push('Tags: '+tags);
							}
							if(typeof track.wiki != 'undefined' && (lookingfor == 'info' || lookingfor == 'summary'))
								sayings.push('Summary: '+track.wiki.summary.replace(/<\/?\w+[^>]*>/,''));
							if(typeof track.url != 'undefined' && (lookingfor == 'info' || lookingfor == 'url'))
								sayings.push(track.url);
							if(lookingfor == 'info')
								sayings.push('===================');

							if(sayings.length == 0)
								sayings = ['Sorry, I could not find any information on this track.'];
							bot.speakArray(sayings);
						},
						error: function(error) {
							console.log("Error: " + error.message);
						}
					}
				});
				return;
			}
			
			if (matches = spokentext.match(/^ lookup ([^\s]*) (.*)/i)) {
				console.log('getting data...');
				var lookup = matches[1];
				var lookingfor = matches[2];
				
				var params = {
					limit: 10,
					handlers: {
						success: function(data) {
							
						},
						error: function(error) {
							console.log("Error: " + error.message);
						}
					}
				};
				
				var requesttype = '';
				switch(lookup) {
					case 'tags':
						requesttype = 'tag.getTopArtists';
						params.handlers.success = function(data) {
							var artist = data.topartists.artist;
							var saying = '';
							for(var i = 0; i < artist.length; i++) {
								saying += artist[i].name;
								if(i+1 < artist.length)
									saying += ', ';
							}
							
							bot.speak(saying);
						}
						params.tag = lookingfor;
						break;
					case 'shows':
						requesttype = 'artist.getEvents';
						params.handlers.success = function(data) {
							var event = data.events.event;
							if(typeof event == 'undefined') {
								bot.speak('There are no shows listed for ' + lookingfor + ' on last.fm');
								return;
							}
							sayings = [];
							if(event.length > 1) {
								for(var i = 0; i < event.length; i++) {
									sayings.push('"' + event[i].venue.name + '" in ' + event[i].venue.location.city + ', ' + event[i].venue.location.country + ' on ' + event[i].startDate + ' ' + event[i].url);
								}
							} else {
								sayings.push('"' + event.venue.name + '" in ' + event.venue.location.city + ', ' + event.venue.location.country + ' on ' + event.startDate + ' ' + event.url);
							}
							
							bot.speakArray(sayings);
						}
						params.artist = lookingfor;
						params.limit = 5;
						break;
					default:
						return;
						break;
				}

				lastfm.request(requesttype, params);
				return;
			}
		});
	}
	
	var updateUserActivity = function(user, date) {
		if(typeof user == 'undefined')
			return;
		if(typeof usersList[user.userid] == 'undefined')
			usersList[user.userid] = user;
		if(typeof date == 'undefined')
			delete usersList[user.userid];
		else {
			user.lastActivity = new Date();
			usersList[user.userid] = user;
		}
	}

	var getCurrentSongInfo = function() {
		if(currentSong.name != '')
			return;
		bot.roomInfo(false,function(data) {
			currentSong.djid = data.room.metadata.current_dj;
			currentSong.name = data.room.metadata.current_song.metadata.song;
			currentSong.artist = data.room.metadata.current_song.metadata.artist;
		});
	}
	
	init(opts);
};

//extra bot functions
Bot.prototype.speakRand = function (arr, callback) {
	var self = this;
	var rand_saying = Math.floor(Math.random() * arr.length);
	bot.speak(arr[rand_saying], callback);
};
Bot.prototype.speakArray = function (arr,iterator) {
	var self = this;
	var i = iterator || 0;
	bot.speak(arr[i],function() {
		var self = this;
		if(arr.length > i+1) {
			i++;
			bot.speakArray(arr,i);
		}
	});
};

module.exports.SiaCore = SiaCore;
