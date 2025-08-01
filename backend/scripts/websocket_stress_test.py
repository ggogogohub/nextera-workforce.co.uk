import asyncio
import json
import websockets
import time
from datetime import datetime

async def stress_test_websockets():
    """
    Stress test WebSocket connections for memory leak detection
    """
    print("🔥 Starting WebSocket Stress Test")
    print("=" * 50)
    
    connections = []
    max_connections = 100  # Reduced for testing
    server_url = "ws://localhost:8000/ws"
    
    try:
        # Phase 1: Rapid connection establishment
        print(f"Phase 1: Establishing {max_connections} connections...")
        start_time = time.time()
        
        for i in range(max_connections):
            try:
                ws = await websockets.connect(f"{server_url}/test_user_{i}")
                connections.append(ws)
                if i % 10 == 0:
                    print(f"  Connected: {i+1}/{max_connections}")
            except Exception as e:
                print(f"  Connection {i} failed: {e}")
        
        connection_time = time.time() - start_time
        print(f"✅ Connected {len(connections)} clients in {connection_time:.2f}s")
        
        # Phase 2: Message bombardment
        print(f"\nPhase 2: Message stress test...")
        message_count = 0
        start_time = time.time()
        
        for round_num in range(10):  # 10 rounds of messages
            tasks = []
            for i, ws in enumerate(connections):
                message = {
                    "type": "test_message",
                    "round": round_num,
                    "user_id": f"test_user_{i}",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": "x" * 100  # 100 char payload
                }
                tasks.append(ws.send(json.dumps(message)))
                message_count += 1
            
            await asyncio.gather(*tasks, return_exceptions=True)
            print(f"  Round {round_num + 1}/10 completed")
            await asyncio.sleep(0.1)  # Brief pause
        
        message_time = time.time() - start_time
        print(f"✅ Sent {message_count} messages in {message_time:.2f}s")
        print(f"   Rate: {message_count/message_time:.1f} messages/second")
        
        # Phase 3: Connection cleanup test
        print(f"\nPhase 3: Connection cleanup test...")
        start_time = time.time()
        
        for i, ws in enumerate(connections):
            try:
                await ws.close()
                if i % 10 == 0:
                    print(f"  Closed: {i+1}/{len(connections)}")
            except Exception as e:
                print(f"  Close {i} failed: {e}")
        
        cleanup_time = time.time() - start_time
        print(f"✅ Cleaned up {len(connections)} connections in {cleanup_time:.2f}s")
        
        # Results summary
        print(f"\n🎯 STRESS TEST RESULTS")
        print(f"=" * 50)
        print(f"Max Concurrent Connections: {len(connections)}")
        print(f"Total Messages Sent: {message_count}")
        print(f"Connection Rate: {len(connections)/connection_time:.1f} conn/s")
        print(f"Message Rate: {message_count/message_time:.1f} msg/s")
        print(f"Cleanup Rate: {len(connections)/cleanup_time:.1f} cleanup/s")
        
        # Memory leak indicators
        if connection_time > 10:
            print("⚠️  WARNING: Slow connection establishment may indicate memory issues")
        if cleanup_time > 5:
            print("⚠️  WARNING: Slow cleanup may indicate memory leaks")
        
        print("✅ Stress test completed successfully")
        
    except Exception as e:
        print(f"❌ Stress test failed: {e}")
        # Cleanup any remaining connections
        for ws in connections:
            try:
                await ws.close()
            except:
                pass

if __name__ == "__main__":
    print("WebSocket Stress Test Tool")
    print("Make sure your server is running on localhost:8000")
    print("Press Ctrl+C to stop\n")
    
    try:
        asyncio.run(stress_test_websockets())
    except KeyboardInterrupt:
        print("\n🛑 Test interrupted by user")
    except Exception as e:
        print(f"❌ Test failed: {e}")