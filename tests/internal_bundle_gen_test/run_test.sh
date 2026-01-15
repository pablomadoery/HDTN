#!/bin/bash
TEST_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# Assuming standard structure: HDTN/tests/internal_bundle_gen_test/run_test.sh
HDTN_ROOT=$(dirname $(dirname $TEST_DIR))
BUILD_DIR=$HDTN_ROOT/build

# Cleanup
pkill -9 hdtn-one-process
pkill -9 bpsink-async
sleep 2

# 1. Start BPSink
echo "Starting BPSink..."
$BUILD_DIR/common/bpcodec/apps/bpsink-async     --my-uri-eid=ipn:2.0     --inducts-config-file=$TEST_DIR/bpsink_inducts.json     > $TEST_DIR/bpsink.log 2>&1 &
BPSINK_PID=$!

sleep 2

# 2. Start HDTN Node 1
echo "Starting HDTN Node 10..."
$BUILD_DIR/module/hdtn_one_process/hdtn-one-process     --hdtn-config-file=$TEST_DIR/node10_config.json     --contact-plan-file=$TEST_DIR/contact_plan.json     > $TEST_DIR/hdtn.log 2>&1 &
HDTN_PID=$!

sleep 15

# 3. Trigger Bundle Generation
echo "Triggering bundle generation..."
python3 $TEST_DIR/trigger_bundle.py 2 "Hello_Internal_Gen_Payload_Check_1234567890"

# 4. Wait a bit for processing
sleep 5

# 5. Stop processes
kill $BPSINK_PID
wait $BPSINK_PID 2>/dev/null
kill $HDTN_PID
wait $HDTN_PID 2>/dev/null

# 6. Check if BPSink received data
echo "Checking BPSink log..."
if grep -q "Payload Only Rate" $TEST_DIR/bpsink.log || grep -q "received 1 bundles" $TEST_DIR/bpsink.log; then
    echo "TEST PASSED: Bundle received by BPSink"
else
    echo "TEST FAILED: Bundle not found in BPSink log"
    echo "--- BPSink Log ---"
    cat $TEST_DIR/bpsink.log
    echo "--- HDTN Log ---"
    cat $TEST_DIR/hdtn.log
fi
