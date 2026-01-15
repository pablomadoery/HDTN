import zmq, json, sys, time

HDTN_SOCKET_ADDR="tcp://127.0.0.1:10100"

def send_generate_bundle(dest_node_id, message):
    context = zmq.Context()
    socket = zmq.Socket(context, zmq.REQ)
    socket.connect(HDTN_SOCKET_ADDR)
    
    reqdata = {
        "apiCall": "generate_bundle",
        "destNodeId": dest_node_id,
        "message": message
    }
    
    print(f"Sending request: {reqdata}")
    socket.send_json(reqdata)
    
    # Wait for response (poll with timeout)
    poller = zmq.Poller()
    poller.register(socket, zmq.POLLIN)
    
    if poller.poll(5000): # 5 seconds timeout
        resp = socket.recv()
        try:
            resp_json = json.loads(resp)
            print(f"Response: {json.dumps(resp_json, indent=2)}")
            if resp_json.get("success") == True:
                print("SUCCESS: Bundle generation triggered.")
                return 0
            else:
                print("FAILURE: API returned error.")
                return 1
        except:
            print(f"Response (raw): {resp}")
            return 1
    else:
        print("Timeout waiting for response")
        return 1

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 trigger_bundle.py <dest_node_id> <message>")
        sys.exit(1)
        
    dest = int(sys.argv[1])
    msg = sys.argv[2]
    
    sys.exit(send_generate_bundle(dest, msg))
