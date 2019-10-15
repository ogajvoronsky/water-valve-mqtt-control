// Vavle 
load('api_config.js');
load('api_rpc.js');
load('api_events.js');
load('api_gpio.js');
load('api_mqtt.js');
load('api_net.js');
load('api_sys.js');
load('api_timer.js');


// pins & mqtt topics
let ON = 0;
let OFF = 1;
let led_pin = 2; // status led
let button_pin = 0; // Button
let valve_move_time = 15000;  //ms
let valve_timer_id = 0;
let valve_open = 1, valve_closed = 0;

//pins where relays connected
// ch1+ch2 - control water valve motor (change polarity)
let relay = {
    ch1: 12,
    ch2: 13,
    ch3: 5,
    ch4: 4,
    valve_state: 0 // 0 -closed, 1-open
};

let cmd_topic = 'water/command'; // command topic (receive)
let stat_topic = 'water/stat'; // publish states
let evs = '???'; //network state


// Initialize pins
GPIO.set_mode(led_pin, GPIO.MODE_OUTPUT);

let init_pin = function(pin) {
    print('Initializing pin: ', pin);
    GPIO.set_mode(pin, GPIO.MODE_OUTPUT);
    GPIO.write(pin, OFF);
};

init_pin(relay.ch1);
init_pin(relay.ch2);
init_pin(relay.ch3);
init_pin(relay.ch4);


// Functions
let led_flash = function(n) {
    // Flash led n-times
    for (let i = 0; i < n; i++) {
        GPIO.write(led_pin, ON);
        Sys.usleep(20000);
        GPIO.write(led_pin, OFF);
        Sys.usleep(40000);
    }
};

let ch_output = function(channel, message) {
    if (message === 'ON') { GPIO.write(channel, ON)}
    if (message === 'OFF') { GPIO.write(channel, OFF)}
};

let valve = function(msg) {
    Timer.del(valve_timer_id);
    if (msg === 'ON') { 
        GPIO.write(relay.ch1, ON); // open valve
        GPIO.write(relay.ch2, OFF);
        relay.valve_state=valve_open;
        valve_timer_id = Timer.set(valve_move_time, 0, function() {
            GPIO.write(relay.ch1, OFF);
            MQTT.pub(stat_topic + '/valve', 'ON', 0, 0);
        }, null);
    }
    if (msg === 'OFF') { 
        GPIO.write(relay.ch2, ON); // close valve
        GPIO.write(relay.ch1, OFF);
        relay.valve_state=valve_closed;
        valve_timer_id = Timer.set(valve_move_time, 0, function(msg) {
            GPIO.write(relay.ch2, OFF);
            MQTT.pub(stat_topic + '/valve', 'OFF', 0, 0);
        }, null);
    }
    if (msg === 'TOGGLE') {
        relay.valve_state === valve_closed ? valve("ON") : valve("OFF");
    }
    
};

MQTT.sub(cmd_topic + '/valve', function(conn, topic, msg) {
    print('MQTT recieved topic:', topic, 'message:', msg);
    valve(msg);
}, null);

MQTT.sub(cmd_topic + '/ch3', function(conn, topic, msg) {
    print('MQTT recieved topic:', topic, 'message:', msg);
    ch_output(relay.ch3, msg);
    MQTT.pub(stat_topic + '/ch3', msg, 0, 0);
}, null);

MQTT.sub(cmd_topic + '/ch4', function(conn, topic, msg) {
    print('MQTT recieved topic:', topic, 'message:', msg);
    ch_output(relay.ch4, msg);
    MQTT.pub(stat_topic + '/ch4', msg, 0, 0);
}, null);



// Blink built-in LED 
// once - got IP
// twice - connecting
// 3-time - disconnected
GPIO.write(led_pin, OFF);

GPIO.set_button_handler(button_pin, GPIO.PULL_UP, GPIO.INT_EDGE_NEG, 200, function () {
    valve("TOGGLE");
    print('Valve button pressed:', relay.valve_state === valve_open ? 'OPEN' : 'CLOSE');
}, null);


Timer.set(10000 /* 10 (sec) */ , Timer.REPEAT, function() {
    MQTT.pub(stat_topic + '/ping','ping' , 0, 0);
    if (evs === 'GOT_IP') { led_flash(1); } else
    if (evs === 'CONNECTING') { led_flash(2); } else
    if (evs === 'DISCONNECTED') { led_flash(3); }
}, null);


// Monitor network connectivity.
Event.addGroupHandler(Net.EVENT_GRP, function(ev, evdata, arg) {
    if (ev === Net.STATUS_DISCONNECTED) {
        evs = 'DISCONNECTED';
    } else if (ev === Net.STATUS_CONNECTING) {
        evs = 'CONNECTING';
    } else if (ev === Net.STATUS_CONNECTED) {
        evs = 'CONNECTED';
    } else if (ev === Net.STATUS_GOT_IP) {
        evs = 'GOT_IP';
    }
    print('== Net event:', ev, evs);
}, null);
